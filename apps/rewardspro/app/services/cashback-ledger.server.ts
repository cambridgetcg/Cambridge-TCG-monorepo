/**
 * Cashback ledger state shared by the writers of store credit.
 *
 * A StoreCreditLedger entry that moves Shopify store credit carries
 * metadata.syncStatus: PENDING (not sent yet), SYNCING (being sent; one
 * writer holds it), SYNCED (Shopify applied it) or NOT_APPLICABLE (nothing
 * left to send, e.g. cashback fully reversed before it was issued).
 *
 * Writers that call Shopify move an entry PENDING to SYNCING first with
 * claimLedgerEntry, so the order webhook, the reconciliation cron, refunds
 * and the merchant's Orders page never send the same entry twice. A writer
 * hands the entry back (PENDING) only when Shopify answered that it applied
 * nothing, or nothing was sent. When Shopify may have applied it (no answer,
 * a 5xx, an error Shopify can raise after running the mutation: the store
 * credit service's `ambiguous`) the entry stays SYNCING (markUnconfirmed).
 */

import { Prisma, type Order, type StoreCreditLedger } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma, { databaseSchema } from "~/db.server";
import { jsonObject } from "~/utils/json-object";
import { createStoreCreditService } from "./shopify-store-credit.service";

const ledgerTable = () => Prisma.raw(`"${databaseSchema}"."StoreCreditLedger"`);
const orderTable = () => Prisma.raw(`"${databaseSchema}"."Order"`);

/**
 * Move an entry's syncStatus from `from` to `to` in one statement, leaving
 * the rest of its metadata untouched. True only for the caller that made
 * the move; the UPDATE waits for a row lock a refund may hold.
 */
export async function claimLedgerEntry(
  id: string,
  from = "PENDING",
  to = "SYNCING",
  db: Pick<typeof prisma, "$executeRaw"> = prisma,
): Promise<boolean> {
  const moved = await db.$executeRaw`
    UPDATE ${ledgerTable()}
    SET "metadata" = jsonb_set(COALESCE("metadata", '{}'::jsonb), '{syncStatus}', to_jsonb(${to}::text))
    WHERE "id" = ${id} AND "metadata"->>'syncStatus' = ${from}`;
  return moved === 1;
}

/** Hold an entry's row lock until the surrounding transaction ends. */
export async function lockLedgerEntry(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM ${ledgerTable()} WHERE "id" = ${id} FOR UPDATE`;
}

/**
 * Hold an order's row lock until the surrounding transaction ends, so the
 * writers of its refund totals (refunds, cancellation) take turns. A
 * transaction that needs both locks takes the cashback entry's first: the
 * cron and the Orders page update the entry before the order when they issue
 * cashback, and the same order means a refund cannot deadlock with them.
 */
export async function lockOrder(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT "id" FROM ${orderTable()} WHERE "id" = ${id} FOR UPDATE`;
}

/**
 * Leave a claimed (SYNCING) entry as it is after Shopify did not confirm
 * its credit or debit: Shopify may have applied it, so nothing may send it
 * again. The note tells the merchant (manualCashbackRefusal) and whoever
 * reconciles the shopper's balance in Shopify. One statement, like a claim.
 */
export async function markUnconfirmed(id: string, error: string | undefined): Promise<void> {
  const note = JSON.stringify({ unconfirmedAt: new Date().toISOString(), lastError: error ?? "No answer from Shopify" });
  await prisma.$executeRaw`
    UPDATE ${ledgerTable()}
    SET "metadata" = COALESCE("metadata", '{}'::jsonb) || ${note}::jsonb
    WHERE "id" = ${id} AND "metadata"->>'syncStatus' = 'SYNCING'`;
}

/**
 * The merchant's "Automatic cashback processing" switch. Off unless turned
 * on, matching the ShopSettings default.
 */
export function isAutoCashbackEnabled(settings: { autoCashbackProcessingEnabled: boolean | null } | null): boolean {
  return settings?.autoCashbackProcessingEnabled === true;
}

export type ManualCashbackResult =
  | { success: true; amount: number; balance: number }
  | { success: false; error: string };

const NOT_RECORDED = "No cashback was recorded for this order when it was paid, so there is none to issue";
const NOTHING_LEFT = "No cashback is left to issue for this order";
const ALREADY_ISSUING = "Cashback for this order is already being issued or was issued";
const UNCONFIRMED =
  "Shopify did not confirm this order's cashback when it was sent, so it may have been applied. Check the customer's store credit in Shopify: it is not sent again";

/**
 * Whether an order counts as refunded in full: Shopify says REFUNDED (a
 * refund, a cancellation or "Sync Orders" may have recorded that), or its
 * refunded total reaches its price. No cashback is issued on such an order,
 * by hand, by orders/paid or by the reconciliation cron.
 */
export function isRefundedInFull(order: Pick<Order, "financialStatus" | "totalPrice" | "totalRefunded">): boolean {
  return order.financialStatus === "REFUNDED" || (order.totalPrice.gt(0) && order.totalRefunded.gte(order.totalPrice));
}

/**
 * Why the merchant cannot issue an order's cashback by hand, or null when
 * they can. Only the CASHBACK_EARNED entry orders/paid recorded as PENDING is
 * issued by hand. Without one there is nothing to issue: none was due when
 * the order was paid (store credit, gift cards and tier products earn none).
 * An entry with no syncStatus is a record imported with the order history
 * (order-sync), never credit owed.
 */
export function manualCashbackRefusal(
  order: Pick<Order, "cashbackProcessed" | "cashbackEligible" | "financialStatus" | "totalPrice" | "totalRefunded">,
  entry: Pick<StoreCreditLedger, "amount" | "metadata"> | null,
): string | null {
  if (order.cashbackProcessed) return "Cashback already processed";
  if (isRefundedInFull(order) || !order.cashbackEligible) return "This order was refunded or is excluded from cashback";
  if (!entry) return NOT_RECORDED;
  const metadata = jsonObject(entry.metadata);
  const status = metadata.syncStatus;
  if (status === "SYNCING" && typeof metadata.unconfirmedAt === "string") return UNCONFIRMED;
  if (status === "SYNCED" || status === "SYNCING") return ALREADY_ISSUING;
  // Fully reversed by refunds before it was issued
  if (status === "NOT_APPLICABLE") return NOTHING_LEFT;
  if (status !== "PENDING") return "This order's cashback is a record imported with the order history, not cashback waiting to be issued";
  return entry.amount.gt(0) ? null : NOTHING_LEFT;
}

/**
 * Issue an order's cashback by hand (the merchant's Orders page). It only
 * ever sends the order's PENDING CASHBACK_EARNED entry, after claiming it
 * (PENDING to SYNCING): the reconciliation cron cannot send it too, and a
 * refund that arrives while Shopify credits the shopper answers 503 and is
 * applied, as a clawback, on Shopify's redelivery. Afterwards the entry
 * records what was actually issued, so later refunds reverse the right
 * amount. Without an `amount` it issues what the entry holds once claimed,
 * after any refunds so far; the merchant's `amount` may not exceed that.
 * When Shopify does not confirm the credit the entry stays SYNCING and is
 * refused from then on: the credit may have been applied.
 */
export async function issueCashbackByHand({
  shop,
  admin,
  orderId,
  amount,
  currency,
  reason,
}: {
  shop: string;
  admin: AdminApiContext;
  orderId: string;
  /** The merchant's own amount, at most what is due; omitted, what is due */
  amount?: number;
  currency: string;
  reason: string;
}): Promise<ManualCashbackResult> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, shop },
    include: { customer: { select: { id: true, shopifyCustomerId: true, storeCredit: true } } },
  });
  if (!order) return { success: false, error: "Order not found" };
  if (!order.customer?.shopifyCustomerId) return { success: false, error: "Customer not found or missing Shopify ID" };
  // The merchant's amount in whole cents, rounded down as Shopify is sent
  // it, so the entry records what the shopper is credited
  const requested = amount === undefined ? undefined : new Prisma.Decimal(amount).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  if (requested !== undefined && !(requested.isFinite() && requested.gt(0))) {
    return { success: false, error: `Invalid cashback amount (${amount})` };
  }

  // The latest entry, as refunds and the Orders page read it: an order the
  // history import saw before orders/paid also has a history record
  const entry = await prisma.storeCreditLedger.findFirst({
    where: { orderId: order.id, type: "CASHBACK_EARNED" },
    select: { id: true, amount: true, metadata: true },
    orderBy: { createdAt: "desc" },
  });
  const refusal = manualCashbackRefusal(order, entry);
  if (!entry || refusal !== null) return { success: false, error: refusal ?? NOT_RECORDED };
  if (!(await claimLedgerEntry(entry.id))) return { success: false, error: ALREADY_ISSUING };

  // Read under the claim: every refund that reduced the entry has committed,
  // and one that starts now finds the entry SYNCING and is retried
  const claimed = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id }, select: { amount: true, metadata: true } });
  const release = () => claimLedgerEntry(entry.id, "SYNCING", "PENDING");
  if (!claimed.amount.gt(0)) {
    await release();
    return { success: false, error: NOTHING_LEFT };
  }
  if (requested !== undefined && claimed.amount.lt(requested)) {
    await release();
    return { success: false, error: `Only ${claimed.amount.toFixed(2)} ${currency} of cashback is due for this order` };
  }
  const due = (requested ?? claimed.amount).toNumber();

  const result = await createStoreCreditService(admin, shop).issueStoreCredit(order.customer.shopifyCustomerId, due, currency, reason);
  if (!result.success && result.ambiguous) {
    await markUnconfirmed(entry.id, result.error);
    return { success: false, error: UNCONFIRMED };
  }
  if (!result.success) {
    await release();
    return { success: false, error: result.error || "Failed to add store credit" };
  }

  // Later refunds reverse shares of the cashback as first recorded
  // (refund-handler.server.ts). Issuing less than is due scales that by the
  // part issued, so a refund takes back its share of what the shopper got.
  const claimedMetadata = jsonObject(claimed.metadata);
  const recordedOriginal = claimedMetadata.originalAmount;
  const original =
    typeof recordedOriginal === "string" || typeof recordedOriginal === "number" ? new Prisma.Decimal(recordedOriginal) : claimed.amount;
  const issuedOriginal = claimed.amount.gt(due)
    ? { originalAmount: original.times(due).dividedBy(claimed.amount).toDecimalPlaces(2).toFixed(2) }
    : {};

  const balance = result.balance ?? Number(order.customer.storeCredit) + due;
  const now = new Date();
  const synced = {
    syncStatus: "SYNCED",
    syncedAt: now.toISOString(),
    shopifyTransactionId: result.transactionId ?? null,
    processedBy: "manual",
    reason,
  };
  await prisma.$transaction([
    prisma.storeCreditLedger.update({
      where: { id: entry.id },
      data: { amount: due, balance, metadata: { ...claimedMetadata, ...issuedOriginal, ...synced } },
    }),
    prisma.customer.update({
      where: { id: order.customerId },
      data: { storeCredit: balance, totalCashbackEarned: { increment: due } },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { cashbackProcessed: true, cashbackAmount: due, processedAt: now },
    }),
  ]);

  return { success: true, amount: due, balance };
}
