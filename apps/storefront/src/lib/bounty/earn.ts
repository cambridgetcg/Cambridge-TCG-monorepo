// Compute how many Berries a PVE victory should award, layering:
//   base            — first_clear_berries (one-time) OR repeat_berries
//   × daily         — diminishing-returns curve on repeat clears per level per day
//   × streak        — bumped by this very call (1.00x day 1 → 1.50x day 26+)
//   × tier          — membership multiplier (Bronze 1.0x, Silver 1.5x, …, OG 7x)
//
// Totals are floored to an integer.

import { query } from "@/lib/db";
import { getUserPerks } from "@/lib/membership/db";
import { bumpStreak } from "@/lib/membership/streak";

export interface EarnBreakdown {
  base: number;
  dailyMultiplier: number;       // 0.10 – 1.00
  streakMultiplier: number;      // 1.00 – 1.50
  tierMultiplier: number;        // 1.00 – 7.00
  total: number;
  clearsToday: number;           // how many times they've cleared this level today, inclusive of current
  currentStreak: number;
  isFirstClear: boolean;
}

// Diminishing curve on repeat clears per level per day.
// N-th clear → this fraction of the base.
function dailyMultiplierForClearCount(nth: number): number {
  if (nth <= 1) return 1.0;
  if (nth === 2) return 0.5;
  if (nth === 3) return 0.25;
  return 0.10;
}

export async function calculateBerriesEarn(args: {
  userId: string;
  levelId: number;
  baseFirstClear: number;
  baseRepeat: number;
  isFirstClear: boolean;
}): Promise<EarnBreakdown> {
  // Count how many wins against this level today (current win is already saved by the caller).
  const countResult = await query(
    `SELECT COUNT(*)::int AS n FROM pve_games
     WHERE user_id = $1 AND level_id = $2
       AND status = 'won'
       AND ended_at >= date_trunc('day', NOW())`,
    [args.userId, args.levelId],
  );
  const clearsToday: number = countResult.rows[0]?.n ?? 1;

  const base = args.isFirstClear ? args.baseFirstClear : args.baseRepeat;

  // First-clears always pay full base. Diminishing curve applies only to repeats.
  const dailyMultiplier = args.isFirstClear ? 1.0 : dailyMultiplierForClearCount(clearsToday);

  // Bump the streak as a side-effect of this win (PVE counts as a daily visit).
  const streak = await bumpStreak(args.userId);

  const perks = await getUserPerks(args.userId);
  const tierMultiplier = perks.points_multiplier ?? 1.0;

  const total = Math.max(
    0,
    Math.floor(base * dailyMultiplier * streak.multiplier * tierMultiplier),
  );

  return {
    base,
    dailyMultiplier,
    streakMultiplier: streak.multiplier,
    tierMultiplier,
    total,
    clearsToday,
    currentStreak: streak.currentStreak,
    isFirstClear: args.isFirstClear,
  };
}
