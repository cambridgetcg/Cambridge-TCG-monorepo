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
  /** Refunded items at their discounted price; for money refunded with no items, that money minus any shipping it refunds (rule 7). */
  productValue: MoneyPair;
  refundedAt: Date;
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
  paidAt: Date;
  financialStatus: string;
  /** The order total, for display only. */
  total: MoneyPair;
  /** Line items after line and order discounts; no shipping, duties, tips or gift-card lines (rule 1). */
  productValue: MoneyPair;
  storeCreditUsed: MoneyPair;
  giftCardUsed: MoneyPair;
  /**
   * The sum of `refunds` when the read had them, or, for a bulk import node
   * with no refunds, the value of quantity − currentQuantity on each line (A7).
   */
  refundedProductValue: MoneyPair;
  refunds: RefundFacts[];
}

const ZERO_PAIR: MoneyPair = { amount: new Money(0), shopAmount: new Money(0) };

function baseOf(
  productValue: Decimal,
  alreadyRefunded: Decimal,
  storeCreditUsed: Decimal,
  giftCardUsed: Decimal,
): Decimal {
  return Money.max(0, new Money(productValue).minus(alreadyRefunded).minus(storeCreditUsed).minus(giftCardUsed));
}

/**
 * Rule 1: the product value after discounts, less anything already refunded
 * (Decision 6), less what was paid with store credit and gift cards, never
 * below zero, so credit never earns credit. Each currency is worked on its own.
 */
export function cashbackBase(
  f: Pick<OrderFacts, "productValue" | "storeCreditUsed" | "giftCardUsed">,
  alreadyRefunded: MoneyPair = ZERO_PAIR,
): MoneyPair {
  return {
    amount: baseOf(f.productValue.amount, alreadyRefunded.amount, f.storeCreditUsed.amount, f.giftCardUsed.amount),
    shopAmount: baseOf(
      f.productValue.shopAmount,
      alreadyRefunded.shopAmount,
      f.storeCreditUsed.shopAmount,
      f.giftCardUsed.shopAmount,
    ),
  };
}

/**
 * Rules 3 and 7: how much cashback one refund takes back. The refund that
 * completes the order takes whatever is left. Any other refund takes its
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
