/**
 * Refund handling: reverse the cashback of a refunded order.
 *
 * An order's cashback is one CASHBACK_EARNED ledger entry. Its
 * metadata.syncStatus says whether it reached the shopper's Shopify store
 * credit: PENDING (recorded, not issued yet; the reconciliation cron or the
 * merchant issues it later), SYNCING (being issued right now) or SYNCED.
 *
 * A refund reverses its share of that cashback:
 * - Not issued yet: the pending entry is reduced, so only the remainder is
 *   ever issued. Nothing was credited, so nothing is debited.
 * - Issued: a REFUND_CLAWBACK entry linked to the OrderRefund records the
 *   reversal, and the same amount is debited from the shopper's store credit
 *   (settleRefundClawback). Reversals never exceed what was credited for the
 *   order, and a debit never exceeds what the shopper still holds: spent
 *   credit cannot be taken back, so the shortfall is recorded on the entry.
 *
 * Partial refunds reverse proportionally; the refund that completes the
 * order reverses whatever remains. Each step is idempotent per Shopify
 * refund, so redelivered webhooks and cancel-then-refund sequences are safe.
 */

import { Prisma } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "~/db.server";
import { jsonObject } from "~/utils/json-object";
import { claimLedgerEntry, lockLedgerEntry } from "./cashback-ledger.server";
import { createStoreCreditService } from "./shopify-store-credit.service";

const LOG_PREFIX = "[Refund Handler]";
const ZERO = new Prisma.Decimal(0);

/** The refund cannot be applied now; answer 5xx so Shopify redelivers it. */
export class RefundRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RefundRetryableError";
  }
}

export interface RefundInput {
  shop: string;
  shopifyOrderId: string;
  shopifyRefundId: string;
  /** Money returned to the shopper by this refund, in `currency` */
  amount: Prisma.Decimal;
  currency: string | null;
  createdAt: Date;
}

export type RefundOutcome =
  | { status: "order_not_found" }
  | {
      status: "recorded";
      /** False when this refund was already applied by an earlier delivery */
      newlyRecorded: boolean;
      orderId: string;
      customerId: string;
      /** Refund amount counted against the order, in the shop currency */
      appliedAmount: Prisma.Decimal;
      /** Cashback reversed by this refund */
      reversedCashback: Prisma.Decimal;
      /** A clawback entry whose store-credit debit is still outstanding */
      pendingClawbackId: string | null;
    };

function syncStatusOf(entry: { metadata: Prisma.JsonValue }): string | undefined {
  const status = jsonObject(entry.metadata).syncStatus;
  return typeof status === "string" ? status : undefined;
}

function decimalOf(value: unknown, fallback: Prisma.Decimal): Prisma.Decimal {
  return typeof value === "string" || typeof value === "number" ? new Prisma.Decimal(value) : fallback;
}

/** `amount` in the shop currency; refund transactions carry the presentment currency. */
function toShopCurrency(
  amount: Prisma.Decimal,
  currency: string | null,
  order: { currency: string; totalPrice: Prisma.Decimal; presentmentCurrency: string | null; presentmentTotal: Prisma.Decimal | null },
): Prisma.Decimal {
  if (!currency || currency === order.currency) return amount;
  if (currency === order.presentmentCurrency && order.presentmentTotal?.gt(0)) {
    return amount.times(order.totalPrice).dividedBy(order.presentmentTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  }
  throw new Error(`Refund currency ${currency} matches neither the shop currency nor the order's presentment currency`);
}

/**
 * Record a Shopify refund against its order and reverse the refunded share of
 * the order's cashback (see the module comment). Runs in one transaction that
 * holds the cashback entry's row lock, so the reconciliation cron cannot issue
 * the entry halfway through.
 */
export async function recordRefund(input: RefundInput): Promise<RefundOutcome> {
  const { shop, shopifyOrderId, shopifyRefundId } = input;

  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { shop_shopifyOrderId: { shop, shopifyOrderId } } });
    if (!order) return { status: "order_not_found" };

    const existing = await tx.orderRefund.findUnique({
      where: { orderId_shopifyRefundId: { orderId: order.id, shopifyRefundId } },
      include: { creditLedgerEntry: { select: { id: true, metadata: true } } },
    });
    if (existing) {
      const entry = existing.creditLedgerEntry;
      return {
        status: "recorded",
        newlyRecorded: false,
        orderId: order.id,
        customerId: order.customerId,
        appliedAmount: existing.amount,
        reversedCashback: existing.cashbackAdjustment ?? ZERO,
        pendingClawbackId: entry && syncStatusOf(entry) === "PENDING" ? entry.id : null,
      };
    }

    // Lock the order's cashback entry first, then read it
    const cashbackRef = await tx.storeCreditLedger.findFirst({
      where: { orderId: order.id, type: "CASHBACK_EARNED" },
      select: { id: true },
    });
    if (cashbackRef) await lockLedgerEntry(tx, cashbackRef.id);
    const cashback = cashbackRef ? await tx.storeCreditLedger.findUniqueOrThrow({ where: { id: cashbackRef.id } }) : null;

    const refundedBefore = order.totalRefunded;
    const refundedAfter = Prisma.Decimal.min(order.totalPrice, refundedBefore.plus(toShopCurrency(input.amount, input.currency, order)));
    const applied = refundedAfter.minus(refundedBefore);
    const completesOrder = order.totalPrice.gt(0) && refundedAfter.gte(order.totalPrice);
    const share = (amount: Prisma.Decimal) =>
      completesOrder || order.totalPrice.lte(0)
        ? amount
        : amount.times(applied).dividedBy(order.totalPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

    const refund = await tx.orderRefund.create({
      data: {
        orderId: order.id,
        shopifyRefundId,
        amount: applied,
        // The webhook total is not split into shipping and tax here
        shippingAmount: 0,
        taxAmount: 0,
        shopifyCreatedAt: input.createdAt,
        processedAt: new Date(),
      },
    });

    let reversed = ZERO;
    let pendingClawbackId: string | null = null;
    const syncStatus = cashback ? syncStatusOf(cashback) : undefined;

    if (cashback && cashback.amount.gt(0)) {
      if (syncStatus === "SYNCING") {
        throw new RefundRetryableError(`Cashback for order ${shopifyOrderId} is being issued; retry the refund later`);
      }

      if (syncStatus === "SYNCED" || order.cashbackProcessed) {
        // Credited: reverse at most what is left of the credit, then debit it
        const priorClawbacks = await tx.storeCreditLedger.findMany({
          where: { orderId: order.id, type: "REFUND_CLAWBACK" },
          select: { amount: true, metadata: true },
        });
        const alreadyReversed = priorClawbacks.reduce(
          (sum, entry) => sum.plus(decimalOf(jsonObject(entry.metadata).reversalAmount, entry.amount.negated())),
          ZERO,
        );
        const remaining = Prisma.Decimal.max(ZERO, cashback.amount.minus(alreadyReversed));
        reversed = completesOrder ? remaining : Prisma.Decimal.min(remaining, share(cashback.amount));

        if (reversed.gt(0)) {
          const customer = await tx.customer.findUniqueOrThrow({ where: { id: order.customerId }, select: { storeCredit: true } });
          const clawback = await tx.storeCreditLedger.create({
            data: {
              customerId: order.customerId,
              shop,
              orderId: order.id,
              refundId: refund.id,
              type: "REFUND_CLAWBACK",
              amount: reversed.negated(),
              // Projected until the debit settles with Shopify's balance
              balance: customer.storeCredit.minus(reversed),
              // (shop, shopifyOrderId, type) is unique, and an order can have
              // several refunds; the order is linked through orderId
              shopifyOrderId: null,
              metadata: {
                shopifyOrderId,
                shopifyRefundId,
                orderName: order.shopifyOrderName,
                refundAmount: applied.toFixed(2),
                reversalAmount: reversed.toFixed(2),
                description: `Cashback reversed for refund on order ${order.shopifyOrderName}`,
                syncStatus: "PENDING",
              },
            },
          });
          pendingClawbackId = clawback.id;
        }
      } else {
        // Not issued yet: shrink what will be issued; nothing to debit
        const metadata = jsonObject(cashback.metadata);
        const original = decimalOf(metadata.originalAmount, cashback.amount);
        reversed = completesOrder ? cashback.amount : Prisma.Decimal.min(cashback.amount, share(original));
        const remaining = cashback.amount.minus(reversed);
        const reversals = Array.isArray(metadata.reversedBeforeIssue) ? metadata.reversedBeforeIssue : [];
        await tx.storeCreditLedger.update({
          where: { id: cashback.id },
          data: {
            amount: remaining,
            metadata: {
              ...metadata,
              originalAmount: original.toFixed(2),
              reversedBeforeIssue: [...reversals, { shopifyRefundId, amount: reversed.toFixed(2) }],
              // A fully reversed entry must never be issued
              ...(remaining.lte(0) && syncStatus === "PENDING" ? { syncStatus: "NOT_APPLICABLE" } : {}),
            },
          },
        });
      }
    }

    await tx.orderRefund.update({
      where: { id: refund.id },
      data: { cashbackAdjustment: reversed, cashbackProcessed: pendingClawbackId === null },
    });

    await tx.order.update({
      where: { id: order.id },
      data: {
        totalRefunded: refundedAfter,
        netAmount: order.totalPrice.minus(refundedAfter),
        // A refund that returned no money (a restock, say) changes nothing
        financialStatus: completesOrder ? "REFUNDED" : refundedAfter.gt(0) ? "PARTIALLY_REFUNDED" : order.financialStatus,
        ...(order.cashbackAmount ? { cashbackAmount: Prisma.Decimal.max(ZERO, order.cashbackAmount.minus(reversed)) } : {}),
        ...(completesOrder ? { cashbackEligible: false } : {}),
      },
    });

    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        totalRefunded: { increment: applied },
        netSpent: { decrement: applied },
        totalCashbackEarned: { decrement: reversed },
      },
    });

    console.log(`${LOG_PREFIX} Refund ${shopifyRefundId} on order ${shopifyOrderId}: ${applied.toFixed(2)} refunded, ${reversed.toFixed(2)} cashback reversed`);

    return {
      status: "recorded",
      newlyRecorded: true,
      orderId: order.id,
      customerId: order.customerId,
      appliedAmount: applied,
      reversedCashback: reversed,
      pendingClawbackId,
    };
  });
}

export interface ClawbackSettlement {
  /** False when another delivery is settling it or it is already settled */
  settled: boolean;
  debited: Prisma.Decimal;
  /** Reversal the shopper had already spent */
  unrecovered: Prisma.Decimal;
}

/**
 * Debit a REFUND_CLAWBACK entry from the shopper's Shopify store credit.
 *
 * The entry is claimed (PENDING to SYNCING) first, so concurrent deliveries
 * debit once. A Shopify failure returns it to PENDING and throws
 * RefundRetryableError; the webhook answers 5xx and the redelivery retries.
 */
export async function settleRefundClawback(
  entryId: string,
  { shop, admin }: { shop: string; admin: AdminApiContext | undefined },
): Promise<ClawbackSettlement> {
  const entry = await prisma.storeCreditLedger.findFirst({
    where: { id: entryId, shop, type: "REFUND_CLAWBACK" },
    include: {
      customer: { select: { id: true, shopifyCustomerId: true } },
      order: { select: { currency: true } },
    },
  });
  if (!entry) throw new Error(`Clawback entry ${entryId} not found`);
  const idle: ClawbackSettlement = { settled: false, debited: ZERO, unrecovered: ZERO };
  if (jsonObject(entry.metadata).syncStatus !== "PENDING") return idle;
  if (!admin) throw new RefundRetryableError(`No Shopify session for ${shop}; cannot debit store credit`);
  if (!(await claimLedgerEntry(entry.id))) return idle;

  // This caller now owns the entry until it leaves SYNCING
  const claimed = await prisma.storeCreditLedger.findUniqueOrThrow({ where: { id: entry.id }, select: { metadata: true } });
  const { lastError: _previousError, ...metadata } = jsonObject(claimed.metadata);
  const release = async (error: string) => {
    await prisma.storeCreditLedger.update({
      where: { id: entry.id },
      data: { metadata: { ...metadata, syncStatus: "PENDING", lastError: error } },
    });
    return new RefundRetryableError(`Store credit debit for clawback ${entry.id} failed: ${error}`);
  };

  const reversal = decimalOf(metadata.reversalAmount, entry.amount.negated());
  let currency = entry.order?.currency || "USD";
  let debit = ZERO;
  let balanceAfter = ZERO;
  let transactionId: string | null = null;
  try {
    const settings = await prisma.shopSettings.findUnique({ where: { shop }, select: { storeCurrency: true } });
    currency = settings?.storeCurrency || currency;
    const storeCredit = createStoreCreditService(admin, shop);

    const balance = await storeCredit.getStoreCreditBalance(entry.customer.shopifyCustomerId);
    if (!balance.success) throw new Error(balance.error ?? "balance query failed");
    const account = balance.accounts?.find((a) => a.balance.currencyCode === currency);
    const available = account ? new Prisma.Decimal(account.balance.amount) : ZERO;
    debit = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(reversal, available));
    balanceAfter = available;

    if (debit.gt(0)) {
      const result = await storeCredit.debitStoreCredit(entry.customer.shopifyCustomerId, debit.toNumber(), currency);
      if (!result.success) throw new Error(result.error ?? "debit failed");
      balanceAfter = result.balance !== undefined ? new Prisma.Decimal(result.balance) : available.minus(debit);
      transactionId = result.transactionId ?? null;
    }
  } catch (error) {
    // Shopify did not apply a debit: hand the entry back for the redelivery
    throw await release(error instanceof Error ? error.message : String(error));
  }

  // From here a failure leaves the entry SYNCING: the debit was applied, so
  // it must not be sent again (store-credit-reconciliation reports the gap)
  const unrecovered = reversal.minus(debit);
  const now = new Date();
  await prisma.$transaction([
    prisma.storeCreditLedger.update({
      where: { id: entry.id },
      data: {
        amount: debit.negated(),
        balance: balanceAfter,
        shopifyTransactionId: transactionId,
        syncedAt: now,
        metadata: {
          ...metadata,
          syncStatus: "SYNCED",
          debitedAmount: debit.toFixed(2),
          unrecoveredAmount: unrecovered.toFixed(2),
          syncedAt: now.toISOString(),
        },
      },
    }),
    prisma.customer.update({ where: { id: entry.customer.id }, data: { storeCredit: balanceAfter } }),
    ...(entry.refundId
      ? [prisma.orderRefund.update({ where: { id: entry.refundId }, data: { cashbackProcessed: true, processedAt: now } })]
      : []),
  ]);

  if (unrecovered.gt(0)) {
    console.warn(`${LOG_PREFIX} Clawback ${entry.id}: ${unrecovered.toFixed(2)} ${currency} was already spent and could not be debited`);
  }
  return { settled: true, debited: debit, unrecovered };
}
