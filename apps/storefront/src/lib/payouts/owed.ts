/**
 * What the platform owes a seller: the one rule, in SQL, for market trades
 * and for auctions.
 *
 * The admin's outstanding list, the seller's payouts page, the trader
 * dashboard, the payout sweep, and the last gate before money moves
 * (recordTradePayout, recordAuctionPayout) all use these, so they cannot
 * disagree about a row. What each adds on top (the hold, the seller's Connect
 * account, one seller's rows) stays with it.
 *
 * A buyer's payment is a timestamp on the sale itself. A trade's is
 * market_trades.buyer_paid_at, set by the Stripe settlement
 * (stripe-checkout-attempts.ts) or by an admin's Mark Paid
 * (updateEscrowStatus). An auction's is auctions.paid_at, set by the Stripe
 * webhook. No code clears either one. A status alone is not evidence of
 * payment: an admin can set any status by hand.
 *
 * Each condition is true or false, never NULL (the status columns are NOT
 * NULL, the rest are IS [NOT] NULL tests). Keep it so: the complement below
 * would lose a row whose condition is NULL.
 */

const ALIAS_RE = /^[a-z_][a-z0-9_]*$/;

function column(alias: string, name: string): string {
  if (alias === "") return name;
  if (!ALIAS_RE.test(alias)) throw new Error(`invalid SQL alias: ${alias}`);
  return `${alias}.${name}`;
}

/** A market trade the seller is owed for: completed, the buyer paid, and the
 *  seller not paid yet. Pass "" for a statement that reads market_trades alone,
 *  without an alias. */
export function owedTradeSql(alias = "t"): string {
  const c = (name: string) => column(alias, name);
  return `(${c("escrow_status")} = 'completed'
        AND ${c("completed_at")} IS NOT NULL
        AND ${c("buyer_paid_at")} IS NOT NULL
        AND ${c("seller_paid_at")} IS NULL)`;
}

/** Completed and not paid out, but not owed. Every completed trade that is not
 *  paid out matches exactly one of this and owedTradeSql, so a trade the rule
 *  leaves out can still be counted for the operator. */
export function completedButNotOwedTradeSql(alias = "t"): string {
  const c = (name: string) => column(alias, name);
  return `(${c("escrow_status")} = 'completed'
        AND ${c("seller_paid_at")} IS NULL
        AND NOT ${owedTradeSql(alias)})`;
}

/** An auction the seller is owed for: the winner paid, it has a seller, the
 *  payout is worked out, and the seller is not paid yet. Pass "" for a
 *  statement that reads auctions alone, without an alias. */
export function owedAuctionSql(alias = "a"): string {
  const c = (name: string) => column(alias, name);
  return `(${c("status")} = 'paid'
        AND ${c("paid_at")} IS NOT NULL
        AND ${c("seller_user_id")} IS NOT NULL
        AND ${c("seller_payout")} IS NOT NULL
        AND ${c("seller_paid_at")} IS NULL)`;
}

export const TRADE_BUYER_NOT_PAID_ERROR =
  "Cannot pay seller: no buyer payment is recorded for this trade.";
export const TRADE_NOT_OWED_ERROR =
  "Cannot pay seller: no payout is owed for this trade.";
export const AUCTION_BUYER_NOT_PAID_ERROR =
  "Cannot pay seller: no winner payment is recorded for this auction.";
export const AUCTION_NOT_OWED_ERROR =
  "Cannot pay seller: no payout is owed for this auction.";
