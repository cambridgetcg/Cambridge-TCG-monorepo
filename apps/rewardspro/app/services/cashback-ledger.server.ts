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
 * and the merchant's Orders page never send the same entry twice.
 */

import { Prisma } from "@prisma/client";
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
 * The merchant's "Automatic cashback processing" switch. Off unless turned
 * on, matching the ShopSettings default.
 */
export function isAutoCashbackEnabled(settings: { autoCashbackProcessingEnabled: boolean | null } | null): boolean {
  return settings?.autoCashbackProcessingEnabled === true;
}

export type ManualCashbackResult =
  | { success: true; amount: number; balance: number }
  | { success: false; error: string };

/**
 * Issue an order's cashback by hand (the merchant's Orders page). A pending
 * CASHBACK_EARNED entry is claimed first, so the reconciliation cron cannot
 * send it too, and afterwards the entry records what was actually issued, so
 * a later refund reverses the right amount. Without an `amount` it issues
 * what the order is due once claimed, after any refunds so far.
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
  /** The merchant's own amount; omitted, the order's recorded cashback */
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
  if (order.cashbackProcessed) return { success: false, error: "Cashback already processed" };
  if (amount !== undefined && !(amount > 0)) return { success: false, error: `Invalid cashback amount (${amount})` };
  const refundedInFull =
    order.financialStatus === "REFUNDED" || (order.totalPrice.gt(0) && order.totalRefunded.gte(order.totalPrice));
  if (refundedInFull || !order.cashbackEligible) {
    return { success: false, error: "This order was refunded or is excluded from cashback" };
  }

  const entry = await prisma.storeCreditLedger.findFirst({
    where: { orderId: order.id, type: "CASHBACK_EARNED" },
    select: { id: true, amount: true, metadata: true },
  });
  const status = entry ? jsonObject(entry.metadata).syncStatus : undefined;
  const busy = { success: false as const, error: "Cashback for this order is already being issued or was issued" };
  if (status === "SYNCED" || status === "SYNCING") return busy;
  // Fully reversed by refunds before it was issued
  if (status === "NOT_APPLICABLE") return { success: false, error: "No cashback is left to issue for this order" };
  const claimed = entry && status === "PENDING" ? await claimLedgerEntry(entry.id) : false;
  if (entry && status === "PENDING" && !claimed) return busy;

  // Read under the claim: every refund that reduced the entry has committed
  const current = entry ? await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id }, select: { amount: true, metadata: true } }) : null;
  const due = amount ?? Number(current?.amount ?? order.cashbackAmount ?? 0);
  if (!(due > 0)) {
    if (claimed && entry) await claimLedgerEntry(entry.id, "SYNCING", "PENDING");
    return { success: false, error: `Invalid cashback amount (${due})` };
  }

  const result = await createStoreCreditService(admin, shop).issueStoreCredit(order.customer.shopifyCustomerId, due, currency, reason);
  if (!result.success) {
    if (claimed && entry) await claimLedgerEntry(entry.id, "SYNCING", "PENDING");
    return { success: false, error: result.error || "Failed to add store credit" };
  }

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
    entry
      ? prisma.storeCreditLedger.update({
          where: { id: entry.id },
          data: { amount: due, balance, metadata: { ...jsonObject(current?.metadata), ...synced } },
        })
      : prisma.storeCreditLedger.create({
          data: {
            customerId: order.customerId,
            shop,
            amount: due,
            balance,
            type: "CASHBACK_EARNED",
            shopifyOrderId: order.shopifyOrderId,
            orderId: order.id,
            metadata: {
              ...synced,
              orderNumber: order.shopifyOrderNumber,
              orderName: order.shopifyOrderName,
              cashbackPercent: order.cashbackPercent,
              tierName: order.tierNameAtOrder,
              description: `Cashback from order ${order.shopifyOrderName}`,
            },
          },
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
