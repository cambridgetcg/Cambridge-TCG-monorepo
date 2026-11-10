/**
 * Recording a refund, and the cashback it takes back (spec 6.3 rules 7, 8, 11).
 *
 * One transaction per refund. It locks the order's cashback payout row first,
 * then the order row (the old app's lock-order rule), so the payout sender
 * can't claim the credit halfway through, and two refunds of one order apply
 * one after the other, each from what the last one left. Only then does it
 * read the order and the earlier take-backs.
 *
 * The refund's natural key (connection, Shopify refund id) is its
 * idempotency: a redelivered refunds/create writes nothing and answers
 * `already_recorded`.
 *
 * Every refund lowers the order's spend by the product value it returns. An
 * order with cashback also gets a reversal ledger entry for its share, moved
 * by a debit payout whose state follows the credit's:
 * - not sent yet (pending, or needs a look because Shopify refused it or it
 *   kept failing): the credit is reduced instead, and the debit has nothing
 *   to send; a credit reduced to 0 has nothing to send either;
 * - being sent right now: retry later (the route answers 503);
 * - maybe sent (the claim finished, unconfirmed, or needs a look because it
 *   couldn't be confirmed): the debit is held until the credit is settled;
 * - sent: the debit is pending, to be taken from what the buyer still holds;
 * - closed or nothing to send: nothing was given, so nothing is taken back.
 * A buyer whose data was erased (customers/redact) can't be debited: the
 * reversal is written for the ledger's trail and its take-back closed at once
 * (MONEY-5), as the redaction closed what was open then.
 *
 * A refund of an imported order that the import's bulk file listed on it
 * (`importRefundIds`) is already in the file's quantities: its row is
 * recorded, for idempotency, and the spend is left as it is. Any other
 * refund of an imported order came after Shopify read it, and counts
 * (Ruling 54).
 *
 * A refund of money with no items whose money is still on its way
 * (`moneyPending`, #195) is recorded at what has succeeded and marked
 * (`moneyPendingSince`): its spend falls by that now, and its take-back
 * waits until its money settles. A refund the import's file listed is never
 * marked. The hourly check reads a marked refund again and settles it
 * (settleRefundMoney): its spend follows what succeeds, and once the money
 * has succeeded or failed (or 30 days have passed) the mark is cleared and
 * the refund's one take-back is written, under the same key and the same
 * locks as any other refund's (Option B: the order panel reads one reversal
 * per refund).
 */
import type { PayoutState, Prisma, PrismaClient } from "@prisma/client";
import type { Decimal } from "decimal.js";
import prisma from "~/db.server";
import type { ConnectionContext } from "./merchant.server";
import { ISSUE_IN, Money, fromDb } from "./money";
import { type MoneyPair, type RefundFacts, refundTakeBack } from "./order-facts";
import { CLAIM_FINISHED_MS, CUSTOMER_ERASED, closeWithoutSending, lockPayout, lockRow } from "./payouts.server";

/** The credit is being sent right now: Shopify should deliver the refund again later. */
export class RefundRetryLater extends Error {
  constructor(message = "The credit is being sent; retry the refund later") {
    super(message);
    this.name = "RefundRetryLater";
  }
}

/**
 * How long Shopify keeps retrying a webhook (rule 8): a refund for an order
 * not recorded yet is worth a 503 only while the order may still be recorded.
 */
export const ORDER_RECORDING_WINDOW_MS = 4 * 60 * 60 * 1000;

/**
 * Whether an order not recorded yet may still be (Ruling 43): it has a buyer,
 * is not a test order, and became paid (`paidAt`) within
 * ORDER_RECORDING_WINDOW_MS of `now`. orders/paid comes when an order becomes
 * paid, which can be long after it was created, and Shopify retries it for
 * about that long; a delivery about such an order answers 503 meanwhile, so
 * Shopify brings it again once orders/paid has recorded the order.
 */
export function mayStillBeRecorded(order: { hasCustomer: boolean; test: boolean; paidAt: Date }, now: number = Date.now()): boolean {
  return order.hasCustomer && !order.test && now - order.paidAt.getTime() < ORDER_RECORDING_WINDOW_MS;
}

export type RecordRefundResult =
  | { status: "order_not_recorded" }
  | { status: "already_recorded" }
  | { status: "recorded"; takenBack: Decimal; reversalPayoutId: string | null; customerId: string };

/** What happens to the take-back, by the credit's state (the brief's table). */
type Effect = "reduce_credit" | "hold" | "debit" | "none";

type CreditState = { id: string; state: PayoutState; lookReason: string | null; claimedAt: Date | null };

function effectOf(credit: CreditState, now: Date): Effect {
  switch (credit.state) {
    case "pending":
      return "reduce_credit";
    case "needs_look":
      switch (credit.lookReason) {
        case "refused":
        case "kept_failing":
          // Nothing reached the buyer.
          return "reduce_credit";
        case "could_not_confirm":
          return "hold";
        default:
          throw new Error(`Credit payout ${credit.id} needs a look for a reason a refund can't judge: ${String(credit.lookReason)}`);
      }
    case "sending":
      if (credit.claimedAt !== null && now.getTime() - credit.claimedAt.getTime() < CLAIM_FINISHED_MS) {
        throw new RefundRetryLater(`Credit payout ${credit.id} is being sent; retry the refund later`);
      }
      return "hold";
    case "unconfirmed":
      return "hold";
    case "sent":
      return "debit";
    case "closed":
    case "nothing_to_send":
      return "none";
    case "held":
      throw new Error(`Credit payout ${credit.id} is held, which only a debit can be`);
  }
}

const REVERSAL_STATE: Record<Exclude<Effect, "none">, PayoutState> = {
  reduce_credit: "nothing_to_send",
  hold: "held",
  debit: "pending",
};

const sum = (values: Decimal[]) => values.reduce((total, v) => total.plus(v), new Money(0));

/** The order's credit, then the order (lockPayout's order): the locks every writer of an order's refunds takes. */
async function lockOrderRefunds(tx: Prisma.TransactionClient, merchantId: string, orderId: string): Promise<void> {
  // The cashback entry is written with the order, in its transaction, so an
  // order a refund can see already has it (or never will).
  const cashbackRef = await tx.ledgerEntry.findUnique({
    where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: `cashback:${orderId}` } },
    select: { payout: { select: { id: true } } },
  });
  if (cashbackRef?.payout) await lockPayout(tx, cashbackRef.payout.id);
  else await lockRow(tx, "orders", orderId);
}

/** What a refund's take-back reads of its order, under the locks. */
const LOCKED_ORDER = {
  customerId: true,
  customer: { select: { redactedAt: true } },
  productAmount: true,
  shopProductAmount: true,
  refundedProductAmount: true,
  shopRefundedProductAmount: true,
} satisfies Prisma.OrderSelect;

type LockedOrder = Prisma.OrderGetPayload<{ select: typeof LOCKED_ORDER }>;

/** The order's cashback entry and its credit, read under the locks; null when it earned none. */
function cashbackOf(tx: Prisma.TransactionClient, merchantId: string, orderId: string) {
  return tx.ledgerEntry.findUnique({
    where: { merchantId_idempotencyKey: { merchantId, idempotencyKey: `cashback:${orderId}` } },
    include: { payout: true },
  });
}

type Recorded = Extract<RecordRefundResult, { status: "recorded" }>;

/**
 * A refund's one take-back (rules 3 and 7), under the locks the caller
 * holds: its share of the cashback, or what is left when it completes the
 * order, by its units or by the order's refunded value (`refundedAfter`, the
 * order's totals once this refund's value is counted) reaching its product
 * value, written as the reversal `reversal:<connection>:<refund>` and moved
 * by a debit whose state follows the credit's (the table in the header).
 * Throws RefundRetryLater while the credit is being sent, and a plain Error
 * for a credit state a refund can't judge; either rolls the caller's
 * transaction back.
 */
async function takeBackInTransaction(
  tx: Prisma.TransactionClient,
  conn: ConnectionContext,
  i: {
    orderId: string;
    refundId: string;
    externalRefundId: string;
    order: LockedOrder;
    refundedAfter: MoneyPair;
    cashback: Awaited<ReturnType<typeof cashbackOf>>;
    refundValue: MoneyPair;
    completesOrder: boolean;
    now: Date;
  },
): Promise<Recorded> {
  const { merchantId, connectionId } = conn;
  const { order, cashback } = i;
  const credit = cashback?.payout ?? null;
  const nothing = { status: "recorded", takenBack: new Money(0), reversalPayoutId: null, customerId: order.customerId } as const;

  const effect: Effect = credit ? effectOf(credit, i.now) : "none";
  // No cashback (off, test, import or nothing earned), or none given: spend only.
  if (!cashback || !credit || effect === "none") return nothing;

  // Rule 7 in the measure the cashback was issued in; the shop-currency
  // amount follows the same refund in the shop's own measure.
  const issued = ISSUE_IN === "presentment";
  const product = fromDb(issued ? order.productAmount : order.shopProductAmount);
  const refundedAfter = issued ? i.refundedAfter.amount : i.refundedAfter.shopAmount;
  // By units first (Ruling 34): rounded-down refund values can fall short of
  // the product value even once every unit is back. A refund of money alone
  // completes the order only by value.
  const completesOrder = i.completesOrder || (product.gt(0) && refundedAfter.gte(product));
  const earlier = await tx.ledgerEntry.findMany({
    where: { merchantId, orderId: i.orderId, kind: "reversal" },
    select: { amount: true, shopAmount: true },
  });
  const takenBack = refundTakeBack({
    cashback: fromDb(cashback.amount),
    orderProductValue: product,
    refundProductValue: issued ? i.refundValue.amount : i.refundValue.shopAmount,
    takenSoFar: sum(earlier.map((e) => fromDb(e.amount).neg())),
    completesOrder,
    currency: cashback.currency,
  });
  if (!takenBack.gt(0)) return nothing;
  const shopTakenBack = refundTakeBack({
    cashback: fromDb(cashback.shopAmount),
    orderProductValue: fromDb(order.shopProductAmount),
    refundProductValue: i.refundValue.shopAmount,
    takenSoFar: sum(earlier.map((e) => fromDb(e.shopAmount).neg())),
    completesOrder,
    currency: conn.currency,
  });

  const reversal = await tx.ledgerEntry.create({
    data: {
      merchantId,
      connectionId,
      customerId: order.customerId,
      orderId: i.orderId,
      refundId: i.refundId,
      kind: "reversal",
      amount: new Money(0).minus(takenBack).toFixed(),
      currency: cashback.currency,
      shopAmount: new Money(0).minus(shopTakenBack).toFixed(),
      tierName: cashback.tierName,
      ratePercent: cashback.ratePercent,
      idempotencyKey: `reversal:${connectionId}:${i.externalRefundId}`,
    },
    select: { id: true },
  });
  const debit = await tx.payout.create({
    data: {
      merchantId,
      ledgerEntryId: reversal.id,
      customerId: order.customerId,
      rail: credit.rail,
      direction: "debit",
      amount: takenBack.toFixed(),
      currency: cashback.currency,
      state: REVERSAL_STATE[effect],
      nextAttemptAt: i.now,
    },
    select: { id: true },
  });
  if (effect === "reduce_credit") {
    // Not sent yet: send less. Nothing left means nothing to send (Ruling 22).
    const left = Money.max(0, fromDb(credit.amount).minus(takenBack));
    await tx.payout.update({
      where: { id: credit.id },
      data: { amount: left.toFixed(), ...(left.isZero() ? { state: "nothing_to_send" as const } : {}) },
    });
  } else if (order.customer.redactedAt !== null) {
    // Nothing more is taken from an erased buyer: close it now, settled
    // automatically, with the adjustment that cancels the reversal.
    const takeBack = await lockPayout(tx, debit.id);
    if (!takeBack) throw new Error(`Take-back payout ${debit.id} went away while it was written`);
    await closeWithoutSending(tx, takeBack, { now: i.now, settledBy: "auto" });
    await tx.payout.update({ where: { id: debit.id }, data: { lastError: CUSTOMER_ERASED } });
  }
  return { status: "recorded", takenBack, reversalPayoutId: debit.id, customerId: order.customerId };
}

/**
 * The body of `recordRefund`, on a transaction the caller holds. recordOrder
 * (A8) calls it inside the order's own transaction for each refund Shopify
 * already shows on a late-recorded order, oldest first, with
 * `appliedBeforeCashback` set (Ruling 24), so a late order ends with exactly
 * the money and ledger an on-time one would have.
 */
export async function recordRefundInTransaction(
  tx: Prisma.TransactionClient,
  conn: ConnectionContext,
  externalOrderId: string,
  refund: RefundFacts,
  o: { now: Date; appliedBeforeCashback: boolean },
): Promise<RecordRefundResult> {
  const { merchantId, connectionId } = conn;
  const orderRef = await tx.order.findUnique({
    where: { connectionId_externalOrderId: { connectionId, externalOrderId } },
    select: { id: true, source: true, importRefundIds: true },
  });
  if (!orderRef) return { status: "order_not_recorded" };
  const orderId = orderRef.id;
  // Counted already by the import's quantities (Ruling 54)
  const listed = orderRef.source === "import" && orderRef.importRefundIds.includes(refund.externalRefundId);
  // Its money still on its way (#195): recorded at what has succeeded, its take-back left to settleRefundMoney
  const marked = refund.moneyPending && !listed;

  await lockOrderRefunds(tx, merchantId, orderId);

  // ON CONFLICT (connection_id, external_refund_id) DO NOTHING.
  const inserted = await tx.refund.createManyAndReturn({
    data: [
      {
        merchantId,
        connectionId,
        orderId,
        externalRefundId: refund.externalRefundId,
        productAmount: refund.productValue.amount.toFixed(),
        shopProductAmount: refund.productValue.shopAmount.toFixed(),
        refundedAt: refund.refundedAt,
        appliedBeforeCashback: o.appliedBeforeCashback,
        moneyPendingSince: marked ? o.now : null,
      },
    ],
    skipDuplicates: true,
    select: { id: true },
  });
  if (inserted.length === 0) return { status: "already_recorded" };
  const refundId = inserted[0].id;

  // Read under the locks: what earlier refunds committed.
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: LOCKED_ORDER });
  const nothing = { status: "recorded", takenBack: new Money(0), reversalPayoutId: null, customerId: order.customerId } as const;

  // Counted already by the import's quantities. An imported order earns no
  // cashback, so there is nothing to take back either.
  if (listed) return nothing;

  const refundedAfter = {
    amount: fromDb(order.refundedProductAmount).plus(refund.productValue.amount),
    shopAmount: fromDb(order.shopRefundedProductAmount).plus(refund.productValue.shopAmount),
  };
  await tx.order.update({
    where: { id: orderId },
    data: { refundedProductAmount: refundedAfter.amount.toFixed(), shopRefundedProductAmount: refundedAfter.shopAmount.toFixed() },
  });
  // Its spend falls by what has succeeded now; its one take-back waits until its money settles (#195)
  if (marked) return nothing;

  return takeBackInTransaction(tx, conn, {
    orderId,
    refundId,
    externalRefundId: refund.externalRefundId,
    order,
    refundedAfter,
    cashback: await cashbackOf(tx, merchantId, orderId),
    refundValue: refund.productValue,
    completesOrder: refund.completesOrder,
    now: o.now,
  });
}

/**
 * Record one Shopify refund of a recorded order. `order_not_recorded` when
 * the order isn't recorded (the route answers 503 inside
 * ORDER_RECORDING_WINDOW_MS); throws RefundRetryLater while the credit is
 * being sent. `db` is the client to run on (tests pass a second one to race
 * two refunds); `now` dates the claim check and the debit's first attempt.
 */
export async function recordRefund(
  conn: ConnectionContext,
  externalOrderId: string,
  refund: RefundFacts,
  db: PrismaClient = prisma,
  now: Date = new Date(),
): Promise<RecordRefundResult> {
  return db.$transaction((tx) =>
    recordRefundInTransaction(tx, conn, externalOrderId, refund, { now, appliedBeforeCashback: false }),
  );
}

export type SettleRefundMoneyResult =
  | { status: "not_marked" }
  | { status: "still_pending"; customerId: string; spendChanged: boolean }
  | { status: "settled"; takenBack: Decimal; reversalPayoutId: string | null; customerId: string };

/**
 * Settle a refund recorded with its money still on its way (#195), from
 * Shopify's read of it now (`read`; null when there is none to trust), in
 * one transaction under the locks recordRefund takes.
 *
 * What has succeeded since it was recorded raises the refund's and the
 * order's refunded values, each currency on its own, never by more than the
 * order has left to refund, and never lowering them (an edit can re-value a
 * refund lower; one already recorded keeps its value). While its money is
 * still pending, and `expired` is false, it stays marked
 * (`still_pending`). Otherwise the mark is cleared and the refund's one
 * take-back is written from its final value, under the standard reversal
 * key, judged against the order's totals with this refund's increase
 * counted, so an increase that brings the order to its product value takes
 * everything left (`settled`). `expired` (30 days, the caller's to judge)
 * takes back only what has succeeded.
 *
 * `not_marked` for a row that is gone (shop/redact) or no longer marked, so
 * settling twice writes nothing. Throws RefundRetryLater while the credit is
 * being sent, and a plain Error for a credit state a refund can't judge;
 * either way nothing is written and the refund stays marked. A take-back it
 * writes is sent by a later run of the hourly check.
 */
export async function settleRefundMoney(
  conn: ConnectionContext,
  refundId: string,
  read: RefundFacts | null,
  o: { now: Date; expired: boolean; db?: PrismaClient },
): Promise<SettleRefundMoneyResult> {
  const { merchantId, connectionId } = conn;
  return (o.db ?? prisma).$transaction(async (tx): Promise<SettleRefundMoneyResult> => {
    const where = { id: refundId, merchantId, connectionId };
    const ref = await tx.refund.findFirst({ where, select: { orderId: true, moneyPendingSince: true } });
    if (!ref || ref.moneyPendingSince === null) return { status: "not_marked" };
    const { orderId } = ref;
    await lockOrderRefunds(tx, merchantId, orderId);

    // Read again under the locks: another settle or shop/redact may have got there first.
    const row = await tx.refund.findFirst({
      where,
      select: { externalRefundId: true, productAmount: true, shopProductAmount: true, moneyPendingSince: true },
    });
    if (!row || row.moneyPendingSince === null) return { status: "not_marked" };
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, select: LOCKED_ORDER });

    // What has succeeded since, at most what the order has left to refund, and never below 0
    const rise = (worth: Decimal | undefined, stored: Prisma.Decimal, product: Prisma.Decimal, refunded: Prisma.Decimal) =>
      worth === undefined ? new Money(0) : Money.max(0, Money.min(worth.minus(fromDb(stored)), fromDb(product).minus(fromDb(refunded))));
    const increase = {
      amount: rise(read?.productValue.amount, row.productAmount, order.productAmount, order.refundedProductAmount),
      shopAmount: rise(read?.productValue.shopAmount, row.shopProductAmount, order.shopProductAmount, order.shopRefundedProductAmount),
    };
    const spendChanged = increase.amount.gt(0) || increase.shopAmount.gt(0);
    const value = {
      amount: fromDb(row.productAmount).plus(increase.amount),
      shopAmount: fromDb(row.shopProductAmount).plus(increase.shopAmount),
    };
    const refundedAfter = {
      amount: fromDb(order.refundedProductAmount).plus(increase.amount),
      shopAmount: fromDb(order.shopRefundedProductAmount).plus(increase.shopAmount),
    };
    const stillPending = read?.moneyPending === true && !o.expired;

    if (spendChanged) {
      await tx.order.update({
        where: { id: orderId },
        data: { refundedProductAmount: refundedAfter.amount.toFixed(), shopRefundedProductAmount: refundedAfter.shopAmount.toFixed() },
      });
    }
    if (spendChanged || !stillPending) {
      await tx.refund.update({
        where: { id: refundId },
        data: {
          ...(spendChanged ? { productAmount: value.amount.toFixed(), shopProductAmount: value.shopAmount.toFixed() } : {}),
          ...(stillPending ? {} : { moneyPendingSince: null }),
        },
      });
    }
    if (stillPending) return { status: "still_pending", customerId: order.customerId, spendChanged };

    const taken = await takeBackInTransaction(tx, conn, {
      orderId,
      refundId,
      externalRefundId: row.externalRefundId,
      order,
      refundedAfter,
      cashback: await cashbackOf(tx, merchantId, orderId),
      refundValue: value,
      // A refund of money completes the order only by value
      completesOrder: false,
      now: o.now,
    });
    return { status: "settled", takenBack: taken.takenBack, reversalPayoutId: taken.reversalPayoutId, customerId: taken.customerId };
  });
}
