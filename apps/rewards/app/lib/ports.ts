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

/**
 * When a read must be over by, as a Date.now() time. A read keeps its own
 * limit too and ends at whichever comes first; a webhook that makes two
 * reads passes both one deadline from when it was received.
 */
export interface ReadOptions {
  deadline?: number;
}

/**
 * One order the hourly sweep looks at: paid, partly or fully refunded, and
 * updated since the sweep's start. `refunds` are Shopify's refunds of it (id
 * and when each was made), or null when the list may be cut short, so the
 * sweep reads the order itself for them.
 */
export interface UpdatedOrder {
  orderGid: string;
  hasCustomer: boolean;
  test: boolean;
  orderedAt: Date;
  cancelledAt: Date | null;
  refunds: Array<{ refundGid: string; refundedAt: Date }> | null;
}

/**
 * What an order source's read throws, alongside its own error type, when the
 * order is past a known limit of the read (an order with more refunds than
 * one read takes): not a failure that trying again could fix, so the hourly
 * sweep logs it rather than counting a problem (M2c-F7).
 */
export interface ReadLimit {
  readonly readLimit: true;
}

/** Whether `error` is an order source's ReadLimit. */
export function isReadLimit(error: unknown): error is Error & ReadLimit {
  return error instanceof Error && (error as Partial<ReadLimit>).readLimit === true;
}

export interface OrderSource {
  /** Throws a ReadLimit error for an order with more refunds than the read takes. */
  readOrder(orderGid: string, o?: ReadOptions): Promise<OrderFacts | null>;
  readRefund(refundGid: string, o?: ReadOptions): Promise<{ orderGid: string; refund: RefundFacts } | null>;
  /** The orders updated since `since`, most recently updated first (rule 13's backstop for orders, refunds and cancellations). */
  recentlyUpdatedOrders(since: Date, o?: ReadOptions): Promise<UpdatedOrder[]>;
}

/**
 * The rail and order source for one store connection; null when the store
 * can't be reached (no usable session); "busy" while another renewal of its
 * token runs (Ruling 85), when the caller leaves the store for its next run
 * without counting a problem (F1-F3).
 */
export type RailFor = (connectionId: string) => Promise<{ rail: PayoutRail; orders: OrderSource } | "busy" | null>;
