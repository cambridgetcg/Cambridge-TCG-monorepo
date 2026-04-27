// PVE win reconciliation sweep.
//
// Finds pve_games rows that are status='won' but never received their
// reward grants (awarded_at IS NULL) older than a small grace window, and
// re-runs grantPveRewardsIdempotent. Recovers from victory-handler crashes
// that flipped status but failed before granting points/credit/pull.
//
// Idempotent both at the sweep level (gated by awarded_at IS NULL) and at
// the per-leg level (ledger-by-reference_id checks inside the helper).

import { query } from "@/lib/db";
import { grantPveRewardsIdempotent } from "./rewards";

const GRACE_SECONDS = 60; // wait this long before treating an unawarded win as failed

export interface PveSweepResult {
  reconciled: number;
  failures: number;
}

export async function runPveReconciliationSweep(): Promise<PveSweepResult> {
  const stale = await query(
    `SELECT g.id AS game_id, g.user_id, g.level_id, g.ended_at,
            l.title AS level_title, l.level_number, l.first_clear_points,
            l.repeat_points, l.first_clear_credit
       FROM pve_games g
       JOIN pve_levels l ON l.id = g.level_id
      WHERE g.status = 'won'
        AND g.awarded_at IS NULL
        AND g.ended_at < NOW() - make_interval(secs => $1)
      LIMIT 200`,
    [GRACE_SECONDS]
  );

  let reconciled = 0;
  let failures = 0;

  for (const row of stale.rows) {
    try {
      // Determine first-clear status from current pve_progress. Crash recovery
      // happens after the fact, so progress may already reflect this win.
      // If progress shows clear_count>1 already, treat as repeat.
      const progressRes = await query(
        `SELECT cleared, clear_count, first_cleared_at
           FROM pve_progress WHERE user_id = $1 AND level_id = $2`,
        [row.user_id, row.level_id]
      );
      const progress = progressRes.rows[0];
      // Heuristic: this game IS the first clear if either no progress row
      // exists yet OR the progress row was written by a prior crash and
      // first_cleared_at matches this game's ended_at within a minute.
      const isFirstClear = !progress
        ? true
        : progress.first_cleared_at &&
          Math.abs(new Date(progress.first_cleared_at).getTime() - new Date(row.ended_at).getTime()) < 60_000;

      await grantPveRewardsIdempotent({
        gameId: row.game_id,
        userId: row.user_id,
        level: {
          id: row.level_id,
          title: row.level_title,
          level_number: row.level_number,
          first_clear_points: row.first_clear_points,
          repeat_points: row.repeat_points,
          first_clear_credit: row.first_clear_credit,
        },
        isFirstClear: !!isFirstClear,
      });
      reconciled++;
    } catch (err) {
      failures++;
      console.error(`[pve-sweep] reconcile failed for game ${row.game_id}:`, err);
    }
  }

  return { reconciled, failures };
}
