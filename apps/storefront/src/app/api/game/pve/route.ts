import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { LEGACY_PVE_GUEST_COOKIE, resolveActor } from "@/lib/game/pve-actor";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";

// GET — list levels and, for a signed-in account, its progress.
export async function GET() {
  const actor = await resolveActor(false);

  const levels = await query(
    `SELECT id, level_number, title, description, opponent_name,
            opponent_icon, difficulty, required_level
       FROM pve_levels
      WHERE is_active=true
      ORDER BY level_number ASC`,
  );

  const progress: Record<
    number,
    {
      cleared: boolean;
      clearCount: number;
      bestTurns: number | null;
      totalPoints: number;
    }
  > = {};
  let activeGame: { gameId: string; levelId: number } | null = null;

  if (actor) {
    const prog = await query(
      `SELECT level_id, cleared, clear_count, best_turns, total_points_earned FROM pve_progress WHERE user_id=$1`,
      [actor.userId],
    );
    for (const p of prog.rows) {
      progress[p.level_id] = {
        cleared: p.cleared,
        clearCount: p.clear_count,
        bestTurns: p.best_turns,
        totalPoints: p.total_points_earned,
      };
    }

    // Most recent unfinished game — lets the map offer "Resume battle"
    // instead of orphaning the row when a player navigates away mid-game.
    const active = await query(
      `SELECT id, level_id FROM pve_games WHERE user_id=$1 AND status='playing'
       ORDER BY created_at DESC LIMIT 1`,
      [actor.userId],
    );
    if (active.rows[0]) {
      activeGame = {
        gameId: active.rows[0].id,
        levelId: active.rows[0].level_id,
      };
    }
  }

  // Determine highest cleared level
  const highestCleared = Math.max(
    0,
    ...Object.entries(progress)
      .filter(([, v]) => v.cleared)
      .map(([k]) => {
        const level = levels.rows.find(
          (l: { id: number }) => l.id === parseInt(k),
        );
        return level?.level_number || 0;
      }),
  );

  const enriched = levels.rows.map((level: Record<string, unknown>) => ({
    ...level,
    progress: progress[level.id as number] || null,
    unlocked: (level.required_level as number) <= highestCleared,
  }));

  const response = NextResponse.json(
    {
      levels: enriched,
      highestCleared,
      activeGame,
      isGuest: false,
      guest_persistence_enabled: false,
      ...PVE_AVAILABILITY,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
  // Older builds used this cookie to attach durable database rows to an
  // unsigned guest identity. It is now ignored everywhere and retired when
  // the PVE client performs its normal status read.
  response.cookies.delete(LEGACY_PVE_GUEST_COOKIE);
  return response;
}
