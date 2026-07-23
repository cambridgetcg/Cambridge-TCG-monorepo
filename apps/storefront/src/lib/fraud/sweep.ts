// Daily fraud detection sweep — detection for human review only.
//
// Walks every user with activity in the last 24h and runs the per-user
// detection passes, emitting advisory signals. No automatic person-level
// action is taken: the signals are surfaced for a human to review.
//
// Self-gates to 04:30 UTC so it runs alongside the existing cron
// rhythm (drift check is at 04:00, this slots in shortly after).

import { query } from "@/lib/db";
import { runAllPasses } from "./passes";

const UTC_HOUR_WINDOW = 4;
const UTC_MINUTE_WINDOW_START = 30;
const UTC_MINUTE_WINDOW_END = 32;

const ACTIVITY_LOOKBACK_HOURS = 24;
const BATCH_SIZE = 500;

export interface FraudSweepResult {
  ranInWindow: boolean;
  scanned: number;
  signalsEmitted: number;
  failures: number;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW
    && now.getUTCMinutes() >= UTC_MINUTE_WINDOW_START
    && now.getUTCMinutes() <  UTC_MINUTE_WINDOW_END;
}

export async function runFraudSweep(opts?: { force?: boolean }): Promise<FraudSweepResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, scanned: 0, signalsEmitted: 0, failures: 0 };
  }

  const result: FraudSweepResult = {
    ranInWindow: true,
    scanned: 0,
    signalsEmitted: 0,
    failures: 0,
  };

  // Active users — same shape as the trust recompute query but tighter
  // window. We scan recent actors specifically because dormant accounts
  // produce no fresh signals.
  const activeRes = await query(
    `SELECT DISTINCT user_id FROM (
       SELECT user_id FROM market_orders
        WHERE created_at >= NOW() - make_interval(hours => $1)
       UNION
       SELECT buyer_id  FROM market_trades
        WHERE created_at >= NOW() - make_interval(hours => $1)
       UNION
       SELECT seller_id FROM market_trades
        WHERE created_at >= NOW() - make_interval(hours => $1)
     ) AS u
     WHERE user_id IS NOT NULL
     LIMIT $2`,
    [ACTIVITY_LOOKBACK_HOURS, BATCH_SIZE],
  );

  for (const row of activeRes.rows) {
    const userId: string = row.user_id;
    try {
      const { emitted } = await runAllPasses(userId);
      result.scanned++;
      result.signalsEmitted += emitted.length;
    } catch (err) {
      result.failures++;
      console.error(`[fraud-sweep] failed for user ${userId}:`, err);
    }
  }

  return result;
}
