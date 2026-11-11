import type { Decimal } from "decimal.js";
import { Money, floorMoney } from "./money";

/** One amount in the buyer's (presentment) currency and the same amount in the shop's currency. */
export interface MoneyPair {
  amount: Decimal;
  shopAmount: Decimal;
}

export interface RefundFacts {
  /** Shopify GID, e.g. gid://shopify/Refund/1. */
  externalRefundId: string;
  /**
   * Refunded items at their discounted price; for money refunded with no items, that money minus any shipping it refunds (rule 7).
   * The refund that completes the order is valued at exactly the product value its earlier refunds left (Ruling 34).
   */
  productValue: MoneyPair;
  refundedAt: Date;
  /**
   * Whether, after this refund, no line with a value has a unit left to refund: every unit bought, net
   * of what order edits removed, has been refunded (Ruling 34). Decided by units, never by rounded
   * values; a refund of money with no items never completes the order this way.
   */
  completesOrder: boolean;
  /**
   * Whether this refund's money is still on its way (#195): a refund with no
   * items that would be worth more if all its money that hasn't failed
   * succeeded. Its value counts only its successful money, so it is recorded
   * at that, marked, and read again until its money settles. Never true for
   * a refund of items, whose value never depends on its money, nor for
   * pending money that would only repay what an order edit left owed or
   * that lies beyond the product value not yet refunded.
   */
  moneyPending: boolean;
}

/** What the engine needs to know about one order, whatever platform it came from. */
export interface OrderFacts {
  /** Shopify GID, e.g. gid://shopify/Order/1. */
  externalOrderId: string;
  /** The order's display name, e.g. #1001. */
  name: string;
  /**
   * The numeric customer id as a string, the form the app proxy's
   * logged_in_customer_id uses; the rail builds gid://shopify/Customer/<id>
   * from it. Null for a guest order.
   */
  externalCustomerId: string | null;
  /** The buyer's (presentment) ISO currency code. */
  currency: string;
  /** The shop's ISO currency code. */
  shopCurrency: string;
  test: boolean;
  cancelledAt: Date | null;
  orderedAt: Date;
  /** When the order became paid: its latest successful sale or capture, else when it was processed. */
  paidAt: Date;
  financialStatus: string;
  /** The order total, for display only. */
  total: MoneyPair;
  /**
   * What the buyer bought (rule 1), in each currency on its own: the sum of
   * the line items' original totals less their line and order discount
   * allocations, with gift-card lines counted as 0; on a read that has the
   * order's refunds, less the units order edits removed, at each line's
   * discounted unit value (Ruling 25); then less the order's tips
   * (totalTipReceivedSet), never below 0 (Ruling 26). Shipping and duties are
   * not line items, so they never enter it. Refunds are not taken off.
   */
  productValue: MoneyPair;
  storeCreditUsed: MoneyPair;
  giftCardUsed: MoneyPair;
  /**
   * The sum of `refunds` on a read that has the order's refunds (0 when there
   * are none), or, for the import's bulk node (which has no refunds, and says
   * so by passing "quantities"), the value of quantity − currentQuantity on
   * each line, rounded down (A7, Ruling 25).
   */
  refundedProductValue: MoneyPair;
  refunds: RefundFacts[];
  /**
   * The import's bulk node only: the ids of the refunds Shopify's file lists
   * on the order. Its quantities already count them, so a refund of the
   * imported order with one of these ids adds no spend when it is recorded
   * later (Ruling 54).
   */
  importRefundIds?: string[];
}

function baseOf(productValue: Decimal, storeCreditUsed: Decimal, giftCardUsed: Decimal): Decimal {
  return Money.max(0, new Money(productValue).minus(storeCreditUsed).minus(giftCardUsed));
}

/**
 * Rule 1: the product value after discounts, less what was paid with store
 * credit and gift cards, never below zero, so credit never earns credit. Each
 * currency is worked on its own. Refunds are never netted here: an order
 * recorded after Shopify shows refunds on it earns on this same full base, and
 * those refunds are then taken back one by one, as refunds that arrive before
 * payout (Ruling 24), so a late order and an on-time one get the same money.
 */
export function cashbackBase(f: Pick<OrderFacts, "productValue" | "storeCreditUsed" | "giftCardUsed">): MoneyPair {
  return {
    amount: baseOf(f.productValue.amount, f.storeCreditUsed.amount, f.giftCardUsed.amount),
    shopAmount: baseOf(f.productValue.shopAmount, f.storeCreditUsed.shopAmount, f.giftCardUsed.shopAmount),
  };
}

/**
 * Rules 3 and 7: how much cashback one refund takes back. The refund that
 * completes the order (by its units, or by its value reaching the order's)
 * takes whatever is left. Any other refund takes its
 * share of the product value, rounded down to the minor unit, capped at
 * what is left and never below zero; a shipping-only refund takes nothing.
 */
export function refundTakeBack(i: {
  cashback: Decimal;
  orderProductValue: Decimal;
  refundProductValue: Decimal;
  takenSoFar: Decimal;
  completesOrder: boolean;
  currency: string;
}): Decimal {
  const left = Money.max(0, new Money(i.cashback).minus(i.takenSoFar));
  if (i.completesOrder) return left;
  // An order with no product value has no share to take (and no division by zero).
  if (!new Money(i.orderProductValue).gt(0)) return new Money(0);
  const share = floorMoney(new Money(i.cashback).times(i.refundProductValue).div(i.orderProductValue), i.currency);
  return Money.max(0, Money.min(share, left));
}
