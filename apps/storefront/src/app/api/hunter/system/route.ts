// The System window — GET /api/hunter/system
// Opens the player's System window: level, rank, XP, Nen profile,
// active quests, available dungeons, Hatsu abilities.
// Solo Leveling's interface made real.

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  // Get or create hunter profile
  const profile = await query(
    `INSERT INTO hunter_profiles (actor_id, actor_kind)
     VALUES ($1, 'player')
     ON CONFLICT (actor_id, actor_kind)
     DO UPDATE SET last_active_at = NOW()
     RETURNING *`,
    [userId]
  );

  if (profile.length === 0) {
    return Response.json({ error: "Could not create hunter profile" }, { status: 500 });
  }

  const p = profile[0];

  // Get active quests (not completed, not expired)
  const quests = await query(
    `SELECT * FROM daily_quests
     WHERE hunter_profile_id = $1
       AND completed = false
       AND expires_at > NOW()
     ORDER BY created_at ASC`,
    [p.id]
  );

  // Get available dungeons (open, rank-eligible)
  const dungeons = await query(
    `SELECT * FROM dungeon_instances
     WHERE status = 'open'
       AND min_rank <= $1
     ORDER BY opened_at DESC
     LIMIT 10`,
    [p.rank]
  );

  return Response.json({
    // The System window
    actorId: p.actor_id,
    actorKind: p.actor_kind,
    displayName: session.user.name || "Hunter",
    level: p.level,
    xp: p.xp,
    rank: p.rank,
    // Nen
    nenType: p.nen_type,
    nenTechniques: p.nen_techniques,
    auraOutput: p.aura_output,
    auraRange: p.aura_range,
    hatsu: p.hatsu,
    // Active quests
    quests: quests,
    // Available dungeons
    dungeons: dungeons,
    // Stats
    matchesPlayed: p.matches_played,
    matchesWon: p.matches_won,
    questsCompleted: p.quests_completed,
    dungeonsCleared: p.dungeons_cleared,
    lastActiveAt: p.last_active_at,
  });
}