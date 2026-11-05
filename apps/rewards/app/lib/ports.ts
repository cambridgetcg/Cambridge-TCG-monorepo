import type { Decimal } from "decimal.js";
import type { OrderFacts, RefundFacts } from "./order-facts";

/**
 * The two ports through which the engine reaches a store (spec 6.1): the
 * payout rail moves money on the store's own credit system, and the order
 * source reads what the engine needs to know about orders. Their Shopify
 * implementations live in app/shopify; the engine never imports them.
 */

/**
 * What the store said about one credit or debit.
 * - `applied`: it was made.
 * - `refused`: it was not made, by the store's own answer or because nothing
 *   was sent. `permanent` when sending it again cannot change the answer
 *   (plan Decision 4); `code` is the store's reason code when it gave one.
 * - `unclear`: it may have been made (no answer, a 5xx, an error the store can
 *   raise after running it), so it must never be sent again blind (rule 9).
 */
export type RailAnswer =
  | { outcome: "applied"; transactionId: string | null }
  | { outcome: "refused"; permanent: boolean; code: string | null; message: string }
  | { outcome: "unclear"; message: string };

/** One credit the store holds for a buyer. */
export interface CreditRecord {
  id: string | null;
  amount: Decimal;
  currency: string;
  createdAt: Date;
}

/**
 * The buyer's credits since a time. `complete` is false when the store would
 * not give all of them back to that time in one read, so a judge reading it
 * must not conclude a credit never arrived.
 */
export type CreditHistoryResult =
  | { status: "found"; credits: CreditRecord[]; complete: boolean }
  | { status: "customer_missing" }
  | { status: "failed"; error: string };

export interface PayoutRail {
  credit(i: { externalCustomerId: string; amount: Decimal; currency: string; notify: boolean }): Promise<RailAnswer>;
  debit(i: { externalCustomerId: string; amount: Decimal; currency: string }): Promise<RailAnswer>;
  /** The buyer's balance in `currency` now; null when the store can't say. */
  balance(externalCustomerId: string, currency: string): Promise<Decimal | null>;
  creditHistory(externalCustomerId: string, since: Date): Promise<CreditHistoryResult>;
}

export interface OrderSource {
  readOrder(orderGid: string): Promise<OrderFacts | null>;
  readRefund(refundGid: string): Promise<{ orderGid: string; refund: RefundFacts } | null>;
  recentPaidOrders(since: Date): Promise<Array<{ orderGid: string; hasCustomer: boolean; test: boolean; orderedAt: Date }>>;
}

/** The rail and order source for one store connection, or null when the store can't be reached (no usable session). */
export type RailFor = (connectionId: string) => Promise<{ rail: PayoutRail; orders: OrderSource } | null>;
