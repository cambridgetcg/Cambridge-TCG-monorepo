// Daily trust score recompute + history snapshot.
//
// calculateTrustScore() is idempotent and called on demand from various
// surfaces (profile load, review submit, dispute resolve). But users
// who never visit their profile and trigger no events accumulate stale
// scores — a Veteran who lost a dispute three months ago might still
// be reported as Veteran on a public profile until something forces
// recompute.
//
// This cron runs daily, recomputes every user with recent activity,
// and snapshots the result to trust_score_history for evolution
// timeseries. Idempotent per UTC day via the history table's PK.

import { query } from "@/lib/db";
import { calculateTrustScore } from "./trust-engine";

const UTC_HOUR_WINDOW = 5;       // run at 05:xx UTC; off-peak
const ACTIVITY_LOOKBACK_DAYS = 90;
const BATCH_SIZE = 500;

export interface TrustRecomputeResult {
  ranInWindow: boolean;
  recomputed: number;
  snapshots: number;
  failures: number;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW && now.getUTCMinutes() < 2;
}

export async function runTrustScoreRecompute(opts?: { force?: boolean }): Promise<TrustRecomputeResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, recomputed: 0, snapshots: 0, failures: 0 };
  }

  const result: TrustRecomputeResult = {
    ranInWindow: true,
    recomputed: 0,
    snapshots: 0,
    failures: 0,
  };

  // Pull active users — anyone who has placed a market order, traded,
  // received a review, or had a dispute touched in the lookback window.
  // We deliberately skip users with zero activity (they have no signal
  // to feed the score; their stored value, if any, is still correct).
  const activeRes = await query(
    `SELECT DISTINCT user_id FROM (
       SELECT user_id FROM market_orders
        WHERE updated_at >= NOW() - make_interval(days => $1)
       UNION
       SELECT buyer_id AS user_id FROM market_trades
        WHERE updated_at >= NOW() - make_interval(days => $1)
       UNION
       SELECT seller_id AS user_id FROM market_trades
        WHERE updated_at >= NOW() - make_interval(days => $1)
       UNION
       SELECT reviewee_id AS user_id FROM trade_reviews
        WHERE created_at >= NOW() - make_interval(days => $1)
       UNION
       SELECT raised_by AS user_id FROM trade_disputes
        WHERE updated_at >= NOW() - make_interval(days => $1)
     ) AS u
     WHERE user_id IS NOT NULL
     LIMIT $2`,
    [ACTIVITY_LOOKBACK_DAYS, BATCH_SIZE],
  );

  for (const row of activeRes.rows) {
    const userId: string = row.user_id;
    try {
      const profile = await calculateTrustScore(userId);
      result.recomputed++;

      // Snapshot to history. PK on (user_id, snapshot_date) means a
      // re-run on the same UTC day is a no-op rather than a duplicate.
      const snap = await query(
        `INSERT INTO trust_score_history
           (user_id, snapshot_date, trust_score,
            total_trades, completed_trades,
            disputes_won, disputes_lost, avg_rating)
         VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, snapshot_date) DO NOTHING
         RETURNING user_id`,
        [
          userId,
          profile.trust_score,
          profile.total_trades,
          profile.completed_trades,
          profile.disputes_won,
          profile.disputes_lost,
          profile.avg_rating,
        ],
      );
      if (snap.rowCount && snap.rowCount > 0) result.snapshots++;
    } catch (err) {
      result.failures++;
      console.error(`[trust-recompute] failed for user ${userId}:`, err);
    }
  }

  return result;
}
