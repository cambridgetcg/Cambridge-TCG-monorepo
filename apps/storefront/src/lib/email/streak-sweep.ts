/**
 * runStreakAtRiskSweep — the platform notices, before midnight, who is
 * about to lose what they have built.
 *
 * ── In one sentence ──────────────────────────────────────────────────────
 *
 * A nightly sweep that queues a "your streak is about to break" email
 * for every user whose `current_streak >= 2` and whose `last_visit_date`
 * was yesterday — i.e. they would keep the streak alive by visiting today,
 * and have not yet.
 *
 * The threshold is two days, not one. We only nudge people who actually
 * built something. The platform respects what it took to be on the
 * second day.
 *
 * ── Read the story ───────────────────────────────────────────────────────
 *
 * The full narrative — the eleven o'clock query, the five-minute slack,
 * the drain-time re-ask, the gentleness this code embodies — is at
 * `docs/connections/at-midnight.md`. That doc is the story-form companion
 * to these in-code docstrings; reading both gives the meaning.
 *
 * ── Where this meets the rest of the platform ────────────────────────────
 *
 *   user_streaks             — the substrate. Source of truth on `current_streak`,
 *                              `longest_streak`, `last_visit_date`,
 *                              `streak_multiplier`. Maintained by `bumpStreak()`
 *                              in `lib/membership/streak.ts`.
 *   scheduleEmail()          — the queue's entry point in `lib/email/queue.ts`.
 *                              Idempotent on `streak_at_risk:<user>:<date>`,
 *                              so this sweep can run any number of times
 *                              tonight and queue at most once per user.
 *   handlers/streak-at-risk  — the drain-time handler. It re-fetches the
 *                              streak and cancels if the user has visited
 *                              between the sweep and the drain. The five
 *                              minutes between sweep and drain are this
 *                              code's apology for almost having interrupted.
 *   /api/cron/streak-at-risk — the storefront cron route that calls this.
 *                              vercel.json holds the schedule (declared);
 *                              cron_runs (proposed in kingdom-042) will
 *                              hold the observed-fired record.
 *
 * Idempotent. Bounded (`LIMIT 1000`). Cheap. The platform is allowed to
 * run this many times an evening; it will not nag.
 */

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
