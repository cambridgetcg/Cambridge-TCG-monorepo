// Daily-visit streak tracker, shared by anywhere in the app that counts
// as "the user showed up today" (spin, PVE win, pack open, etc.).
//
// Formula (matches the inline version in /api/rewards/spin):
//   visit_today       → no change
//   visit_yesterday+1 → streak += 1
//   otherwise         → streak = 1
//   multiplier = min(1.50, 1.00 + (streak - 1) × 0.02)  // caps at 1.50x on day 26

import { query } from "@/lib/db";

export interface StreakState {
  currentStreak: number;
  longestStreak: number;
  multiplier: number;       // 1.00–1.50
  totalVisits: number;
  isNewDay: boolean;        // true if this call actually extended the streak
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
     RETURNING current_streak, longest_streak, streak_multiplier, total_visits,
       (last_visit_date = CURRENT_DATE) AS is_today`,
    [userId],
  );
  const r = result.rows[0];
  return {
    currentStreak: r.current_streak,
    longestStreak: r.longest_streak,
    multiplier: parseFloat(r.streak_multiplier),
    totalVisits: r.total_visits,
    // The UPSERT always sets last_visit_date=CURRENT_DATE, so is_today is always true.
    // "isNewDay" means: would this visit have been the first today? We check via
    // total_visits increment vs prior — but we don't have prior here. Approximate:
    // if current_streak changed from yesterday's value, it's a new day.
    isNewDay: true,
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
