// Public profile activity stats.
//
// OUTWARD-facing dual of getUserJourney: where the journey shows the
// USER themselves their own audit trail, this shows OTHER users a
// redacted aggregate suitable for cross-user trust signaling.
//
// "Trust score: 87" is opaque. "47 completed trades · 12 five-star
// reviews" is concrete. That's the strengthening of the trust cluster
// this module delivers without publishing a person's financial history.
//
// Privacy contract — what gets exposed:
//   ✓ COUNTS per category (47 trades, not which trades)
//   ✓ JOINED milestone (not a live-activity trail)
//   ✓ POSITIVE OUTCOMES (5-star review count) but not identities
//   ✗ Specific event metadata (no card names, no amounts)
//   ✗ Payment, refund, cancellation or chargeback counts
//   ✗ Last-active timestamps
//   ✗ Anything from admin_actions_log or fraud_signals

import { query } from "@/lib/db";

export interface PublicProfileStats {
  joined_at: string | null;

  trades: {
    completed: number;
  };
  reviews: {
    received_5_star: number;
    received_total: number;
    given_total: number;
  };
}

/**
 * Build the public stats payload from existing tables in one parallel
 * fan-out. No new schema; pure composition.
 */
export async function getPublicProfileStats(userId: string): Promise<PublicProfileStats> {
  const [
    userRes, tradesRes, reviewsRecvRes, reviewsGivenRes,
  ] = await Promise.all([
    query(`SELECT created_at FROM users WHERE id = $1`, [userId]),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE escrow_status = 'completed')::int AS completed
       FROM market_trades WHERE buyer_id = $1 OR seller_id = $1`,
      [userId],
    ),
    query(
       `SELECT
         COUNT(*) FILTER (WHERE rating = 5 AND admin_hidden = false)::int AS five_star,
         COUNT(*) FILTER (WHERE admin_hidden = false)::int AS total
       FROM trade_reviews WHERE reviewee_id = $1 AND is_public = true`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM trade_reviews
        WHERE reviewer_id = $1 AND is_public = true`,
      [userId],
    ),
  ]);

  return {
    joined_at: userRes.rows[0]?.created_at ?? null,
    trades: {
      completed: tradesRes.rows[0]?.completed ?? 0,
    },
    reviews: {
      received_5_star: reviewsRecvRes.rows[0]?.five_star ?? 0,
      received_total: reviewsRecvRes.rows[0]?.total ?? 0,
      given_total: reviewsGivenRes.rows[0]?.n ?? 0,
    },
  };
}
