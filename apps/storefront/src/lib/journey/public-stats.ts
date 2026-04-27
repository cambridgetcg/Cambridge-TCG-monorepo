// Public profile activity stats.
//
// OUTWARD-facing dual of getUserJourney: where the journey shows the
// USER themselves their own audit trail, this shows OTHER users a
// redacted aggregate suitable for cross-user trust signaling.
//
// "Trust score: 87" is opaque. "47 trades · 12 prizes shipped · 0
// chargebacks · joined 11 months ago" is concrete. That's the
// strengthening of the trust cluster this module delivers.
//
// Privacy contract — what gets exposed:
//   ✓ COUNTS per category (47 trades, not which trades)
//   ✓ TIME milestones (joined date, last activity bucket)
//   ✓ POSITIVE OUTCOMES (5-star review count) but not identities
//   ✗ Specific event metadata (no card names, no amounts)
//   ✗ Negative-outcome details visible to others (count of chargebacks
//     IS shown — buyers need to know — but reasons aren't)
//   ✗ Anything from admin_actions_log or fraud_signals beyond a
//     suspended-account flag
//
// Cached at the API edge for 5 minutes; public data + frequent reads.

import { query } from "@/lib/db";

export interface PublicProfileStats {
  joined_at: string | null;
  last_active_at: string | null;
  is_suspended: boolean;

  trades: {
    completed: number;
    refunded: number;
    cancelled: number;
  };
  prizes: {
    shipped: number;
  };
  vault: {
    items_shipped: number;
  };
  reviews: {
    received_5_star: number;
    received_total: number;
    given_total: number;
  };
  external_rep: {
    verified_platforms: string[];
  };
  payment_health: {
    chargebacks: number;
    completed_payment_count_proxy: number; // = completed trades
  };
}

/**
 * Build the public stats payload from existing tables in one parallel
 * fan-out. No new schema; pure composition.
 */
export async function getPublicProfileStats(userId: string): Promise<PublicProfileStats> {
  const [
    userRes, suspendRes, tradesRes, prizesRes, vaultRes,
    reviewsRecvRes, reviewsGivenRes, extRepRes, cbRes, lastActRes,
  ] = await Promise.all([
    query(`SELECT created_at FROM users WHERE id = $1`, [userId]),
    query(`SELECT is_suspended FROM trust_profiles WHERE user_id = $1`, [userId]),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE escrow_status = 'completed')::int AS completed,
         COUNT(*) FILTER (WHERE escrow_status = 'refunded')::int  AS refunded,
         COUNT(*) FILTER (WHERE escrow_status = 'cancelled')::int AS cancelled
       FROM market_trades WHERE buyer_id = $1 OR seller_id = $1`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM prize_fulfilment_log
        WHERE user_id = $1 AND action = 'shipped'`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM vault_items
        WHERE user_id = $1 AND status = 'redeemed'`,
      [userId],
    ),
    query(
      `SELECT
         COUNT(*) FILTER (WHERE rating = 5 AND admin_hidden = false)::int AS five_star,
         COUNT(*) FILTER (WHERE admin_hidden = false)::int AS total
       FROM trade_reviews WHERE reviewee_id = $1`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM trade_reviews WHERE reviewer_id = $1`,
      [userId],
    ),
    query(
      `SELECT platform FROM external_reputation
        WHERE user_id = $1 AND verified = true`,
      [userId],
    ),
    query(
      `SELECT COUNT(*)::int AS n FROM chargebacks WHERE user_id = $1`,
      [userId],
    ),
    // Last-activity bucket: GREATEST across the recent-activity-bearing
    // tables. Daily granularity is enough for "active recently" copy.
    query(
      `SELECT GREATEST(
         (SELECT MAX(updated_at) FROM market_trades  WHERE buyer_id = $1 OR seller_id = $1),
         (SELECT MAX(created_at) FROM trade_reviews  WHERE reviewer_id = $1),
         (SELECT MAX(created_at) FROM market_orders  WHERE user_id = $1)
       ) AS ts`,
      [userId],
    ),
  ]);

  return {
    joined_at: userRes.rows[0]?.created_at ?? null,
    last_active_at: lastActRes.rows[0]?.ts ?? null,
    is_suspended: suspendRes.rows[0]?.is_suspended === true,
    trades: {
      completed: tradesRes.rows[0]?.completed ?? 0,
      refunded: tradesRes.rows[0]?.refunded ?? 0,
      cancelled: tradesRes.rows[0]?.cancelled ?? 0,
    },
    prizes: { shipped: prizesRes.rows[0]?.n ?? 0 },
    vault:  { items_shipped: vaultRes.rows[0]?.n ?? 0 },
    reviews: {
      received_5_star: reviewsRecvRes.rows[0]?.five_star ?? 0,
      received_total: reviewsRecvRes.rows[0]?.total ?? 0,
      given_total: reviewsGivenRes.rows[0]?.n ?? 0,
    },
    external_rep: {
      verified_platforms: extRepRes.rows.map((r) => r.platform),
    },
    payment_health: {
      chargebacks: cbRes.rows[0]?.n ?? 0,
      completed_payment_count_proxy: tradesRes.rows[0]?.completed ?? 0,
    },
  };
}
