import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// GET — list levels with player progress
export async function GET() {
  const session = await auth();

  const levels = await query(
    `SELECT * FROM pve_levels WHERE is_active=true ORDER BY level_number ASC`
  );

  const progress: Record<number, { cleared: boolean; clearCount: number; bestTurns: number | null; totalPoints: number }> = {};

  if (session?.user?.id) {
    const prog = await query(
      `SELECT level_id, cleared, clear_count, best_turns, total_points_earned FROM pve_progress WHERE user_id=$1`,
      [session.user.id]
    );
    for (const p of prog.rows) {
      progress[p.level_id] = {
        cleared: p.cleared,
        clearCount: p.clear_count,
        bestTurns: p.best_turns,
        totalPoints: p.total_points_earned,
      };
    }
  }

  // Determine highest cleared level
  const highestCleared = Math.max(0, ...Object.entries(progress).filter(([, v]) => v.cleared).map(([k]) => {
    const level = levels.rows.find((l: { id: number }) => l.id === parseInt(k));
    return level?.level_number || 0;
  }));

  const enriched = levels.rows.map((level: Record<string, unknown>) => ({
    ...level,
    progress: progress[level.id as number] || null,
    unlocked: (level.required_level as number) <= highestCleared,
  }));

  return NextResponse.json({ levels: enriched, highestCleared });
}
