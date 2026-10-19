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
 *
 * Both order syncs ("Sync Orders" on the Orders page and the background
 * order-sync job) copy Shopify's refunds onto an order as OrderRefund rows,
 * with its refunded total, and reverse no cashback. orders/paid and the
 * reconciliation cron take those refunds' shares before they record or
 * issue cashback, and note each row's share on it (cashbackAdjustment). A
 * refund reaches the cashback once, whichever path sees it first: when its
 * refunds/create arrives, recordRefund applies the row a sync imported
 * (found by the refund's Shopify id) and reverses only what was not taken
 * yet (cashbackTakenBefore).
 */

import { Prisma, type OrderFinancialStatus } from "@prisma/client";
import type { AdminApiContext } from "@shopify/shopify-app-remix/server";
import prisma from "~/db.server";
import { jsonObject } from "~/utils/json-object";
import { claimLedgerEntry, isRefundedInFull, lockLedgerEntry, lockOrder, markUnconfirmed } from "./cashback-ledger.server";
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
      /** Cashback this refund took back: before issue (orders/paid, the cron or itself) and as a clawback */
      reversedCashback: Prisma.Decimal;
      /** A clawback entry whose store-credit debit is still outstanding */
      pendingClawbackId: string | null;
    };

/**
 * How long after an order is placed orders/paid may still record it: at
 * least as long as Shopify keeps redelivering a failed orders/paid (48 hours
 * at most).
 */
const ORDER_RECORDING_WINDOW_MS = 48 * 60 * 60 * 1000;

const REFUNDED_ORDER_QUERY = `#graphql
  query RefundedOrderCustomer($id: ID!) {
    order(id: $id) {
      id
      createdAt
      customer {
        id
      }
    }
  }
`;

interface RefundedOrder {
  createdAt: string;
  customer: { id: string } | null;
}

/**
 * Whether orders/paid may still record the order of a refund that arrived
 * before it. Shopify delivers webhooks in no set order and redelivers a
 * failed orders/paid later; a refund dropped meanwhile would leave the
 * cashback orders/paid then records unreversed. True for an order with a
 * customer placed within the recording window: refunds/create answers 503
 * so that Shopify redelivers the refund. Guest checkouts are never recorded,
 * and neither are older orders that are not recorded by now (placed before
 * the app was installed, say). Without a session nothing can be recorded.
 */
export async function orderMayStillBeRecorded(
  admin: AdminApiContext | undefined,
  shopifyOrderId: string,
  now: Date = new Date(),
): Promise<boolean> {
  if (!admin) return false;
  const response = await admin.graphql(REFUNDED_ORDER_QUERY, { variables: { id: `gid://shopify/Order/${shopifyOrderId}` } });
  const { data } = await response.json();
  const order: RefundedOrder | null | undefined = data?.order;
  if (!order?.customer) return false;
  return now.getTime() - new Date(order.createdAt).getTime() < ORDER_RECORDING_WINDOW_MS;
}

function syncStatusOf(entry: { metadata: Prisma.JsonValue }): string | undefined {
  const status = jsonObject(entry.metadata).syncStatus;
  return typeof status === "string" ? status : undefined;
}

function decimalOf(value: unknown, fallback: Prisma.Decimal): Prisma.Decimal {
  return typeof value === "string" || typeof value === "number" ? new Prisma.Decimal(value) : fallback;
}

/** What refunds took off a cashback entry before it was issued (metadata.reversedBeforeIssue). */
function reversedBeforeIssue(metadata: Prisma.JsonObject): Prisma.Decimal {
  const reversals = Array.isArray(metadata.reversedBeforeIssue) ? metadata.reversedBeforeIssue : [];
  return reversals.reduce<Prisma.Decimal>((sum, reversal) => sum.plus(decimalOf(jsonObject(reversal).amount, ZERO)), ZERO);
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
 * The share of `cashback` that a refund of `applied` takes back from an order
 * of `totalPrice`: all of it when the refund completes the order.
 */
function refundShare(cashback: Prisma.Decimal, applied: Prisma.Decimal, totalPrice: Prisma.Decimal, completesOrder: boolean): Prisma.Decimal {
  if (completesOrder || totalPrice.lte(0)) return cashback;
  return cashback.times(applied).dividedBy(totalPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}

export interface RecordedRefundReversal {
  refundId: string;
  shopifyRefundId: string;
  amount: Prisma.Decimal;
}

/**
 * What the refunds recorded on an order before its cashback entry existed
 * take back from the `earned` cashback, for orders/paid recording the entry
 * after them. Each refund, in order, reverses what recordRefund would have
 * taken from a pending entry: its share of `earned`, or whatever is left
 * when it completes the order.
 */
export function reverseRecordedRefunds(
  earned: Prisma.Decimal,
  totalPrice: Prisma.Decimal,
  refunds: Array<{ id: string; shopifyRefundId: string; amount: Prisma.Decimal }>,
): { remaining: Prisma.Decimal; reversals: RecordedRefundReversal[] } {
  let refunded = ZERO;
  let remaining = earned;
  const reversals: RecordedRefundReversal[] = [];
  for (const refund of refunds) {
    refunded = refunded.plus(refund.amount);
    const completesOrder = totalPrice.gt(0) && refunded.gte(totalPrice);
    const amount = completesOrder ? remaining : Prisma.Decimal.min(remaining, refundShare(earned, refund.amount, totalPrice, completesOrder));
    remaining = remaining.minus(amount);
    reversals.push({ refundId: refund.id, shopifyRefundId: refund.shopifyRefundId, amount });
  }
  return { remaining, reversals };
}

export interface OrderRefunds {
  totalPrice: Prisma.Decimal;
  totalRefunded: Prisma.Decimal;
  financialStatus: OrderFinancialStatus;
  cashbackEligible: boolean;
  /** The refunds recorded against the order, oldest first */
  refunds: Array<{ id: string; shopifyRefundId: string; amount: Prisma.Decimal }>;
}

/**
 * What is left of an order's `original` cashback after every refund the
 * order shows, for a writer about to record or issue cashback that has not
 * been issued: orders/paid under the order's lock, and the reconciliation
 * cron under its claim.
 * - Nothing when the order was refunded in full or is excluded from
 *   cashback, as the Orders page refuses it (isRefundedInFull).
 * - Otherwise each recorded refund takes its share (reverseRecordedRefunds),
 *   and so does the part of the order's refunded total that no recorded
 *   refund accounts for (`unrecorded`): "Sync Orders" copies Shopify's
 *   totals onto an order it already has without recording its refunds.
 */
export function cashbackLeftAfterRefunds(
  original: Prisma.Decimal,
  order: OrderRefunds,
): { remaining: Prisma.Decimal; reversals: RecordedRefundReversal[]; unrecorded: Prisma.Decimal } {
  const { remaining, reversals } = reverseRecordedRefunds(original, order.totalPrice, order.refunds);
  if (!order.cashbackEligible || isRefundedInFull(order)) return { remaining: ZERO, reversals, unrecorded: remaining };
  const recordedRefunds = order.refunds.reduce((sum, refund) => sum.plus(refund.amount), ZERO);
  const refundedWithoutRecord = order.totalRefunded.minus(recordedRefunds);
  if (refundedWithoutRecord.lte(0)) return { remaining, reversals, unrecorded: ZERO };
  const unrecorded = Prisma.Decimal.min(remaining, refundShare(original, refundedWithoutRecord, order.totalPrice, false));
  return { remaining: remaining.minus(unrecorded), reversals, unrecorded };
}

/**
 * How much of a refund's cashback share was taken off the order before
 * recordRefund applied the refund, so that it is not taken twice:
 * - `own`: what the refund's row says was taken for it. orders/paid and the
 *   reconciliation cron take the share of each refund row a sync imported
 *   before they record or issue the cashback, and note it on the row.
 * - from `unclaimed`, the reversals no refund row accounts for, at most
 *   `matchedShare`: the share of the part of this refund that the order
 *   counted before its refunds/create arrived. Such reversals are the share
 *   orders/paid or the cron took of a refunded total the order showed
 *   without refund rows (as the background order sync left orders until it
 *   imported refund rows), or of a row the cron netted before it noted
 *   shares on rows.
 */
export function cashbackTakenBefore({
  matchedShare,
  own,
  unclaimed,
}: {
  matchedShare: Prisma.Decimal;
  own: Prisma.Decimal;
  unclaimed: Prisma.Decimal;
}): Prisma.Decimal {
  const notYetOwn = Prisma.Decimal.max(ZERO, matchedShare.minus(own));
  return own.plus(Prisma.Decimal.min(Prisma.Decimal.max(ZERO, unclaimed), notYetOwn));
}

/**
 * Record a Shopify refund against its order, or apply the row a sync imported
 * for it, and reverse the refunded share of the order's cashback that was not
 * taken before (see the module comment). Runs in one transaction that
 * holds the cashback entry's and the order's row locks, so the reconciliation
 * cron cannot issue the entry halfway through and concurrent refunds of one
 * order apply one after the other, each from the totals the last one left.
 */
export async function recordRefund(input: RefundInput, db: Pick<typeof prisma, "$transaction"> = prisma): Promise<RefundOutcome> {
  const { shop, shopifyOrderId, shopifyRefundId } = input;

  return db.$transaction(async (tx) => {
    const orderRef = await tx.order.findUnique({ where: { shop_shopifyOrderId: { shop, shopifyOrderId } }, select: { id: true } });
    if (!orderRef) return { status: "order_not_found" };

    // Lock the cashback entry, then the order (lockOrder), and only then read
    // them: under READ COMMITTED each read sees what earlier refunds committed.
    // The latest entry is the order's cashback: one the history import saw
    // before its orders/paid webhook was processed also has a history record.
    const cashbackWhere: Prisma.StoreCreditLedgerWhereInput = { orderId: orderRef.id, type: "CASHBACK_EARNED" };
    const cashbackRefs = await tx.storeCreditLedger.findMany({ where: cashbackWhere, select: { id: true }, orderBy: { createdAt: "desc" } });
    const cashbackRef = cashbackRefs[0] ?? null;
    if (cashbackRef) await lockLedgerEntry(tx, cashbackRef.id);
    await lockOrder(tx, orderRef.id);
    // An entry recorded since the lookup (orders/paid records it under the
    // order's lock, so while this refund waited for it) is not locked, so the
    // cron could issue it mid-refund. Shopify redelivers on 5xx, and the next
    // attempt locks it.
    const recordedSince = await tx.storeCreditLedger.findFirst({
      where: { ...cashbackWhere, id: { notIn: cashbackRefs.map((ref) => ref.id) } },
      select: { id: true },
    });
    if (recordedSince) {
      throw new RefundRetryableError(`Cashback for order ${shopifyOrderId} was recorded during the refund; retry the refund`);
    }
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderRef.id } });
    const cashback = cashbackRef ? await tx.storeCreditLedger.findUniqueOrThrow({ where: { id: cashbackRef.id } }) : null;

    const existing = await tx.orderRefund.findUnique({
      where: { orderId_shopifyRefundId: { orderId: order.id, shopifyRefundId } },
      include: { creditLedgerEntry: { select: { id: true, metadata: true } } },
    });
    // Only recordRefund sets processedAt: a row without it was imported by a
    // sync, and this delivery applies its cashback (the module comment)
    if (existing?.processedAt) {
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

    // Count the refund against the order's refund rows, not its refunded
    // total: a sync copies Shopify's total, which may already include this
    // refund (the background order sync copied it without the refund's row
    // until it imported refund rows). The total becomes the larger of the
    // two, so a refund already in it is not counted twice.
    const otherRefunds = await tx.orderRefund.findMany({
      where: { orderId: order.id, shopifyRefundId: { not: shopifyRefundId } },
      select: { amount: true, cashbackAdjustment: true },
    });
    const recordedBefore = otherRefunds.reduce((sum, row) => sum.plus(row.amount), ZERO);
    const incoming = existing ? existing.amount : toShopCurrency(input.amount, input.currency, order);
    const applied = Prisma.Decimal.max(ZERO, Prisma.Decimal.min(incoming, order.totalPrice.minus(recordedBefore)));
    const refundedAfter = Prisma.Decimal.min(order.totalPrice, Prisma.Decimal.max(order.totalRefunded, recordedBefore.plus(applied)));
    const completesOrder = order.totalPrice.gt(0) && refundedAfter.gte(order.totalPrice);
    const share = (amount: Prisma.Decimal) => refundShare(amount, applied, order.totalPrice, completesOrder);
    // The part of this refund the order counted before it arrived: all of an
    // imported row; of a new refund, what the total shows beyond the rows
    const matched = existing
      ? applied
      : Prisma.Decimal.min(applied, Prisma.Decimal.max(ZERO, order.totalRefunded.minus(recordedBefore)));

    const now = new Date();
    const refund = existing
      ? await tx.orderRefund.update({ where: { id: existing.id }, data: { processedAt: now } })
      : await tx.orderRefund.create({
          data: {
            orderId: order.id,
            shopifyRefundId,
            amount: applied,
            // The webhook total is not split into shipping and tax here
            shippingAmount: 0,
            taxAmount: 0,
            shopifyCreatedAt: input.createdAt,
            processedAt: now,
          },
        });

    let reversed = ZERO;
    let takenBefore = existing?.cashbackAdjustment ?? ZERO;
    let pendingClawbackId: string | null = null;
    const syncStatus = cashback ? syncStatusOf(cashback) : undefined;
    // Refunds reverse shares of the cashback as first recorded, before any
    // reversal shrank it (a refund before issue sets originalAmount)
    const metadata = cashback ? jsonObject(cashback.metadata) : {};
    const original = cashback ? decimalOf(metadata.originalAmount, cashback.amount) : ZERO;

    if (cashback && cashback.amount.gt(0)) {
      if (syncStatus === "SYNCING") {
        throw new RefundRetryableError(`Cashback for order ${shopifyOrderId} is being issued; retry the refund later`);
      }

      const priorClawbacks = await tx.storeCreditLedger.findMany({
        where: { orderId: order.id, type: "REFUND_CLAWBACK" },
        select: { amount: true, metadata: true },
      });
      const alreadyReversed = priorClawbacks.reduce(
        (sum, entry) => sum.plus(decimalOf(jsonObject(entry.metadata).reversalAmount, entry.amount.negated())),
        ZERO,
      );
      // Every reversal of this cashback, before issue and after, less what the
      // refund rows say they took: what no refund has claimed yet
      const claimed = otherRefunds.reduce((sum, row) => sum.plus(row.cashbackAdjustment ?? ZERO), takenBefore);
      takenBefore = cashbackTakenBefore({
        matchedShare: refundShare(original, matched, order.totalPrice, false),
        own: takenBefore,
        unclaimed: reversedBeforeIssue(metadata).plus(alreadyReversed).minus(claimed),
      });
      const due = Prisma.Decimal.max(ZERO, share(original).minus(takenBefore));

      if (syncStatus === "SYNCED" || order.cashbackProcessed) {
        // Credited: reverse at most what is left of the credit, then debit it
        const remaining = Prisma.Decimal.max(ZERO, cashback.amount.minus(alreadyReversed));
        reversed = completesOrder ? remaining : Prisma.Decimal.min(remaining, due);

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
        reversed = completesOrder ? cashback.amount : Prisma.Decimal.min(cashback.amount, due);
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

    // The refund's share of the cashback: taken before it arrived, and now
    await tx.orderRefund.update({
      where: { id: refund.id },
      data: { cashbackAdjustment: takenBefore.plus(reversed), cashbackProcessed: pendingClawbackId === null },
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

    // The customer's totals follow the order's (the syncs sum them from orders)
    const newlyRefunded = refundedAfter.minus(order.totalRefunded);
    await tx.customer.update({
      where: { id: order.customerId },
      data: {
        totalRefunded: { increment: newlyRefunded },
        netSpent: { decrement: newlyRefunded },
        totalCashbackEarned: { decrement: reversed },
      },
    });

    console.log(
      `${LOG_PREFIX} Refund ${shopifyRefundId} on order ${shopifyOrderId}${existing ? " (imported by a sync)" : ""}: ` +
        `${applied.toFixed(2)} refunded, ${reversed.toFixed(2)} cashback reversed, ${takenBefore.toFixed(2)} taken before`,
    );

    return {
      status: "recorded",
      newlyRecorded: true,
      orderId: order.id,
      customerId: order.customerId,
      appliedAmount: applied,
      reversedCashback: takenBefore.plus(reversed),
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
  /** Not settled because Shopify never confirmed an earlier debit of it */
  unconfirmed: boolean;
}

/**
 * Debit a REFUND_CLAWBACK entry from the shopper's Shopify store credit.
 *
 * The entry is claimed (PENDING to SYNCING) first, so concurrent deliveries
 * debit once. When Shopify answers that it applied nothing, the entry goes
 * back to PENDING and RefundRetryableError makes the webhook answer 5xx, so
 * the redelivery retries. Otherwise the debit may have been applied (no
 * answer, a 5xx, an error Shopify can raise after running the mutation):
 * the entry stays SYNCING (markUnconfirmed) and is never sent again.
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
  const idle: ClawbackSettlement = { settled: false, debited: ZERO, unrecovered: ZERO, unconfirmed: false };
  const current = jsonObject(entry.metadata);
  if (current.syncStatus !== "PENDING") return { ...idle, unconfirmed: typeof current.unconfirmedAt === "string" };
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
  let unanswered: string | null = null;
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
      if (!result.success && result.ambiguous) {
        unanswered = result.error ?? "No answer from Shopify";
      } else if (!result.success) {
        throw new Error(result.error ?? "debit failed");
      } else {
        balanceAfter = result.balance !== undefined ? new Prisma.Decimal(result.balance) : available.minus(debit);
        transactionId = result.transactionId ?? null;
      }
    }
  } catch (error) {
    // Shopify did not apply a debit: hand the entry back for the redelivery
    throw await release(error instanceof Error ? error.message : String(error));
  }
  if (unanswered !== null) {
    // Shopify may have applied it: neither the redelivery nor the Orders
    // page sends it again (the entry stays SYNCING)
    await markUnconfirmed(entry.id, unanswered);
    throw new RefundRetryableError(`Shopify did not confirm the store credit debit for clawback ${entry.id}; it is not sent again`);
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
  return { settled: true, debited: debit, unrecovered, unconfirmed: false };
}
