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
 * a later refund reverses the right amount.
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
  amount: number;
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
  if (!(amount > 0)) return { success: false, error: `Invalid cashback amount (${amount})` };

  const entry = await prisma.storeCreditLedger.findFirst({
    where: { orderId: order.id, type: "CASHBACK_EARNED" },
    select: { id: true, metadata: true },
  });
  const status = entry ? jsonObject(entry.metadata).syncStatus : undefined;
  const busy = { success: false as const, error: "Cashback for this order is already being issued or was issued" };
  if (status === "SYNCED" || status === "SYNCING") return busy;
  const claimed = entry && status === "PENDING" ? await claimLedgerEntry(entry.id) : false;
  if (entry && status === "PENDING" && !claimed) return busy;

  const result = await createStoreCreditService(admin, shop).issueStoreCredit(order.customer.shopifyCustomerId, amount, currency, reason);
  if (!result.success) {
    if (claimed && entry) await claimLedgerEntry(entry.id, "SYNCING", "PENDING");
    return { success: false, error: result.error || "Failed to add store credit" };
  }

  const balance = result.balance ?? Number(order.customer.storeCredit) + amount;
  const now = new Date();
  // Re-read under the claim: a refund may have updated it before the claim
  const current = entry ? await prisma.storeCreditLedger.findUnique({ where: { id: entry.id }, select: { metadata: true } }) : null;
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
          data: { amount, balance, metadata: { ...jsonObject(current?.metadata), ...synced } },
        })
      : prisma.storeCreditLedger.create({
          data: {
            customerId: order.customerId,
            shop,
            amount,
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
      data: { storeCredit: balance, totalCashbackEarned: { increment: amount } },
    }),
    prisma.order.update({
      where: { id: order.id },
      data: { cashbackProcessed: true, cashbackAmount: amount, processedAt: now },
    }),
  ]);

  return { success: true, amount, balance };
}
