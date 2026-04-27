import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getUserPerks } from "@/lib/membership/db";
import { getStreakMultiplier } from "@/lib/membership/streak";
import { query } from "@/lib/db";

// GET — returns the multipliers that would apply to a PVE clear right now,
// plus per-level clear counts for today so the client can render the daily
// diminishing curve. Used by /play/adventure to preview expected earnings
// before the user picks a level.
//
// Shape:
//   {
//     tierMultiplier: 2.0,
//     streakMultiplier: 1.14,
//     currentStreak: 8,
//     clearsTodayByLevel: { "3": 2, "5": 1, ... },  // keyed by level id
//     eligible: boolean,  // signed in
//   }
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({
      tierMultiplier: 1.0,
      streakMultiplier: 1.0,
      currentStreak: 0,
      clearsTodayByLevel: {},
      eligible: false,
    });
  }

  const perks = await getUserPerks(session.user.id);
  const streakMultiplier = await getStreakMultiplier(session.user.id);

  const streakRow = await query(
    `SELECT current_streak FROM user_streaks WHERE user_id = $1`,
    [session.user.id],
  );
  const currentStreak: number = streakRow.rows[0]?.current_streak ?? 0;

  const clearsToday = await query(
    `SELECT level_id, COUNT(*)::int AS n
     FROM pve_games
     WHERE user_id = $1
       AND status = 'won'
       AND ended_at >= date_trunc('day', NOW())
     GROUP BY level_id`,
    [session.user.id],
  );
  const clearsTodayByLevel: Record<string, number> = {};
  for (const r of clearsToday.rows) {
    clearsTodayByLevel[String(r.level_id)] = r.n;
  }

  return NextResponse.json({
    tierMultiplier: perks.points_multiplier ?? 1.0,
    streakMultiplier,
    currentStreak,
    clearsTodayByLevel,
    eligible: true,
  });
}
