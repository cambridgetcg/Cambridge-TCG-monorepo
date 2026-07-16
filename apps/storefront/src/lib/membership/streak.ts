/**
 * bumpStreak — the platform's only formal acknowledgment of *showing up*.
 *
 * ── What this function says, by what it does ─────────────────────────────
 *
 * Every action that means "the user is here today" calls this — pack open,
 * PVE win, spin, daily visit ping. The function records that visit on
 * `user_streaks` and returns the current state. The `INSERT … ON CONFLICT
 * DO UPDATE` encodes three rules:
 *
 *   visit_today        → no change                        (idempotent)
 *   visit_yesterday+1  → streak += 1                      (continued)
 *   otherwise          → streak = 1                       (cleared)
 *
 *   multiplier         = min(1.50, 1.00 + (streak − 1) × 0.02)
 *                        i.e. caps at 1.50× on day 26
 *
 * There is no soft fail. Skip a day and the count resets. That sharpness
 * is what makes the streak mean anything — the user knows the platform
 * means *consecutive*, and so the streak counts only the discipline they
 * actually showed.
 *
 * ── The two multipliers nobody coordinated ───────────────────────────────
 *
 * `streak_multiplier` here and `tier.points_multiplier` over in
 * `lib/membership/db.ts` are independent. Both apply to a points-earning
 * event. A 23-day Gold member earns at:
 *
 *   base_points × tier_multiplier × streak_multiplier
 *
 * Neither file references the other. The two systems modulate the same
 * earned-currency from different premises (loyalty-by-spend vs
 * loyalty-by-presence). The platform does not require a Gold member to
 * also be a streak-keeper, and does not require a streak-keeper to also
 * be Gold. Each is independently rewarded.
 *
 * ── Read the story ───────────────────────────────────────────────────────
 *
 * `docs/connections/at-midnight.md` is the narrative companion: a user
 * on day 23, the sweep that finds them, the email scheduled and possibly
 * cancelled, and what their tomorrow looks like in either branch. The
 * story names the meaning that this function alone cannot speak.
 *
 * ── Where this meets the rest of the platform ────────────────────────────
 *
 *   /api/rewards/spin, pack-open, PVE handlers — every "I'm here today"
 *                      surface calls this directly or indirectly.
 *   user_streaks       — the table this writes.
 *   streak-sweep.ts    — the nightly read on this same table.
 *   streak-at-risk handler — the drain-time re-fetch of the same row.
 *   tier.points_multiplier — the parallel multiplier (see above).
 */

import { query } from "@/lib/db";

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;       // 1.00–1.50
  totalVisits: number;
}

export async function bumpStreak(userId: string): Promise<StreakState> {
  const result = await query(
    `INSERT INTO user_streaks (user_id, current_streak, last_visit_date, total_visits, streak_multiplier)
     VALUES ($1, 1, CURRENT_DATE, 1, 1.00)
     ON CONFLICT (user_id) DO UPDATE SET
       current_streak = CASE
         WHEN user_streaks.last_visit_date = CURRENT_DATE THEN user_streaks.current_streak
         WHEN user_streaks.last_visit_date = CURRENT_DATE - 1 THEN user_streaks.current_streak + 1
         ELSE 1
       END,
       longest_streak = GREATEST(user_streaks.longest_streak,
         CASE
           WHEN user_streaks.last_visit_date = CURRENT_DATE THEN user_streaks.current_streak
           WHEN user_streaks.last_visit_date = CURRENT_DATE - 1 THEN user_streaks.current_streak + 1
           ELSE 1
         END
       ),
       last_visit_date = CURRENT_DATE,
       total_visits = user_streaks.total_visits
         + CASE WHEN user_streaks.last_visit_date = CURRENT_DATE THEN 0 ELSE 1 END,
       streak_multiplier = LEAST(1.50, 1.00 + (
         CASE
           WHEN user_streaks.last_visit_date = CURRENT_DATE THEN user_streaks.current_streak
           WHEN user_streaks.last_visit_date = CURRENT_DATE - 1 THEN user_streaks.current_streak + 1
           ELSE 1
         END - 1) * 0.02),
       updated_at = NOW()
     RETURNING current_streak, longest_streak, streak_multiplier, total_visits`,
    [userId],
  );
  const r = result.rows[0];
  return {
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    multiplier: parseFloat(r.streak_multiplier),
    totalVisits: r.total_visits,
  };
}

export async function getStreakMultiplier(userId: string): Promise<number> {
  const result = await query(
    `SELECT streak_multiplier FROM user_streaks WHERE user_id = $1`,
    [userId],
  );
  if (result.rows.length === 0) return 1.0;
  return parseFloat(result.rows[0].streak_multiplier);
}
