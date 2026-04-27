// Automated payout cron.
//
// Runs from /api/cron/maintenance. Finds trades and auctions that are
// (a) in a payout-eligible state, (b) past their hold period, and
// (c) owned by a seller with stripe_connect_payouts_enabled = true, then
// calls the existing recordTradePayout / recordAuctionPayout with
// method='stripe_connect'. Those paths already handle the Stripe Transfer
// (with idempotency keys), the DB stamp, and the seller email.
//
// Failures are per-row — one seller's disabled account doesn't block the
// rest of the sweep. Every run is rate-capped to keep the Stripe API
// exposure bounded even in pathological backlogs.

import { query } from "@/lib/db";

const MAX_PAYOUTS_PER_RUN = 50;
// Auctions don't carry a per-auction hold; use a platform default.
const AUCTION_HOLD_DAYS = 3;

export interface PayoutSweepResult {
  tradesPaid: number;
  auctionsPaid: number;
  tradeFailures: Array<{ id: string; error: string }>;
  auctionFailures: Array<{ id: string; error: string }>;
  throttled: boolean;    // true if we hit MAX_PAYOUTS_PER_RUN
}

export async function runPayoutSweep(): Promise<PayoutSweepResult> {
  const result: PayoutSweepResult = {
    tradesPaid: 0,
    auctionsPaid: 0,
    tradeFailures: [],
    auctionFailures: [],
    throttled: false,
  };

  let budget = MAX_PAYOUTS_PER_RUN;

  // ── Trades ──
  // completed_at + payout_hold_days < NOW() AND seller's Connect is live
  const tradeRows = await query(
    `SELECT t.id
       FROM market_trades t
       JOIN users u ON u.id = t.seller_id
      WHERE t.escrow_status = 'completed'
        AND t.seller_paid_at IS NULL
        AND t.completed_at IS NOT NULL
        AND t.completed_at + make_interval(days => COALESCE(t.payout_hold_days, 0)) < NOW()
        AND u.stripe_connect_payouts_enabled = true
      ORDER BY t.completed_at ASC
      LIMIT $1`,
    [budget]
  );

  const { recordTradePayout } = await import("@/lib/market/db");
  for (const row of tradeRows.rows) {
    if (budget <= 0) { result.throttled = true; break; }
    budget--;
    try {
      const r = await recordTradePayout({ tradeId: row.id, method: "stripe_connect" });
      if (r.ok) result.tradesPaid++;
      else result.tradeFailures.push({ id: row.id, error: r.error });
    } catch (err) {
      result.tradeFailures.push({
        id: row.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  if (budget <= 0) return result;

  // ── Auctions ──
  // status='paid' AND paid_at + AUCTION_HOLD_DAYS < NOW() AND seller Connect live
  const auctionRows = await query(
    `SELECT a.id
       FROM auctions a
       JOIN users u ON u.id = a.seller_user_id
      WHERE a.status = 'paid'
        AND a.seller_paid_at IS NULL
        AND a.seller_payout IS NOT NULL
        AND a.paid_at IS NOT NULL
        AND a.paid_at + make_interval(days => $1) < NOW()
        AND u.stripe_connect_payouts_enabled = true
      ORDER BY a.paid_at ASC
      LIMIT $2`,
    [AUCTION_HOLD_DAYS, budget]
  );

  const { recordAuctionPayout } = await import("@/lib/auction/db");
  for (const row of auctionRows.rows) {
    if (budget <= 0) { result.throttled = true; break; }
    budget--;
    try {
      const r = await recordAuctionPayout({ auctionId: row.id, method: "stripe_connect" });
      if (r.ok) result.auctionsPaid++;
      else result.auctionFailures.push({ id: row.id, error: r.error });
    } catch (err) {
      result.auctionFailures.push({
        id: row.id,
        error: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return result;
}
