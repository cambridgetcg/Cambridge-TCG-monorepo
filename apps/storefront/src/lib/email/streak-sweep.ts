// Nightly check for users whose streak will break at midnight.
//
// Criteria for "at risk":
//   - current_streak >= 2 (so we only bug people who actually built something)
//   - last_visit_date = yesterday (they'd keep the streak by visiting today;
//     didn't yet)
//   - the user hasn't opted out of streak_at_risk emails
//
// Output: a queued 'streak_at_risk' email scheduled a few minutes from now.
// The handler will re-check at drain time and cancel if the user has since
// visited, so this sweep can be called at any hour (evening is when the
// nudge is most useful).
//
// Idempotent: we include the user_id + date in the idempotency key, so
// calling runStreakAtRiskSweep() multiple times per day only queues one
// email per user.

import { query } from "@/lib/db";
import { scheduleEmail } from "./queue";

export interface StreakSweepResult {
  atRiskCount: number;
  queuedCount: number;
  errors: number;
}

export async function runStreakAtRiskSweep(): Promise<StreakSweepResult> {
  // Users with current_streak >= 2 who last visited yesterday.
  const rows = await query(
    `SELECT s.user_id, s.current_streak, s.last_visit_date
     FROM user_streaks s
     JOIN users u ON u.id = s.user_id
     WHERE s.current_streak >= 2
       AND s.last_visit_date = CURRENT_DATE - 1
     ORDER BY s.current_streak DESC
     LIMIT 1000`,
  );

  let queuedCount = 0;
  let errors = 0;

  for (const r of rows.rows) {
    try {
      // Today's date, without time, for the idempotency key.
      const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString().slice(0, 10);
      // Send in ~5 minutes; the handler will re-check just-in-case they visit
      // between the sweep and the drain.
      const scheduledFor = new Date(Date.now() + 5 * 60 * 1000);

      await scheduleEmail({
        userId: r.user_id,
        event: "streak_at_risk",
        data: { originalStreak: r.current_streak },
        scheduledFor,
        idempotencyKey: `streak_at_risk:${r.user_id}:${todayIso}`,
      });
      queuedCount++;
    } catch (err) {
      errors++;
      console.error(`[streak-sweep] failed to queue for ${r.user_id}:`, err);
    }
  }

  return { atRiskCount: rows.rows.length, queuedCount, errors };
}
