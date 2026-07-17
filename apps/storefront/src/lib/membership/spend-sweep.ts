// Rolling-window annual spend recompute. Fires from the cron route once
// a day. Replaces the sticky users.annual_spend that monotonically grew —
// now reflects actual spending in the trailing 365 days, so a customer
// who took a year off naturally drops a tier rather than staying pinned.
//
// After recomputing, calls recalculateTier per user that crossed a threshold
// (either gained or lost a tier). Logs but doesn't stop on per-user error.

import { query } from "@/lib/db";
import { recalculateTier } from "./db";

const WINDOW_DAYS = 365;
const MAX_RECOMPUTE_PER_RUN = 5000;

export interface SpendSweepResult {
  recomputed: number;
  tierChanges: number;
  failures: number;
  ranInWindow: boolean;
}

// Self-gate: run once per UTC day at 02:00. The cron ticks every minute,
// the gate keeps it cheap. recalculateTier is idempotent so a duplicate
// run within the same window would be safe; the gate is mostly a cost
// optimization.
function inWindow(now = new Date()): boolean {
  return now.getUTCHours() === 2 && now.getUTCMinutes() < 2;
}

export async function runAnnualSpendRecompute(opts?: { force?: boolean }): Promise<SpendSweepResult> {
  if (!opts?.force && !inWindow()) {
    return { recomputed: 0, tierChanges: 0, failures: 0, ranInWindow: false };
  }

  // Compute fresh annual_spend per user from the last WINDOW_DAYS of money
  // spent THROUGH the platform. Since the shop closed, this is dominated by
  // peer-to-peer buying: a completed P2P trade, a completed P2P lot, and a won
  // auction all count on the BUYER's side (the money they paid). Seller
  // proceeds are earnings, not spend, so they never count — and counting only
  // the payer keeps a two-sided wash-trade from inflating both parties freely.
  // We update users.annual_spend in one statement; recalc fan-out comes after.
  const updated = await query(
    `WITH raw AS (
       SELECT user_id, total_gbp::numeric AS amount
         FROM customer_orders
        WHERE user_id IS NOT NULL AND status = 'completed'
          AND created_at > NOW() - make_interval(days => $1)
       UNION ALL
       SELECT buyer_id AS user_id, (price * quantity)::numeric AS amount
         FROM market_trades
        WHERE escrow_status = 'completed'
          AND completed_at > NOW() - make_interval(days => $1)
       UNION ALL
       SELECT buyer_user_id AS user_id, price::numeric AS amount
         FROM market_lot_trades
        WHERE escrow_status = 'completed'
          AND completed_at > NOW() - make_interval(days => $1)
       UNION ALL
       SELECT winner_user_id AS user_id, current_price::numeric AS amount
         FROM auctions
        WHERE winner_user_id IS NOT NULL AND status = 'paid'
          AND paid_at > NOW() - make_interval(days => $1)
     ),
     spend AS (
       SELECT user_id, SUM(amount)::numeric AS amount
         FROM raw WHERE user_id IS NOT NULL
        GROUP BY user_id
     )
     UPDATE users u
        SET annual_spend = COALESCE(s.amount, 0),
            updated_at   = NOW()
       FROM (SELECT id FROM users WHERE annual_spend > 0
              UNION
              SELECT user_id FROM spend) ids
       LEFT JOIN spend s ON s.user_id = ids.id
      WHERE u.id = ids.id
      RETURNING u.id`,
    [WINDOW_DAYS]
  );

  const ids = updated.rows.slice(0, MAX_RECOMPUTE_PER_RUN).map((r) => r.id as string);

  let tierChanges = 0;
  let failures = 0;
  for (const id of ids) {
    try {
      const result = await recalculateTier(id);
      if (result.changed) tierChanges++;
    } catch (err) {
      failures++;
      console.error(`[spend] recalc failed for ${id}:`, err);
    }
  }

  return { recomputed: ids.length, tierChanges, failures, ranInWindow: true };
}
