// Dungeons — GET /api/hunter/dungeons
// Lists available dungeon instances, rank-gated.
// Solo Leveling: red gates, dungeon instances, rank-locked challenges.

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profiles = await query(
    `SELECT rank FROM hunter_profiles WHERE actor_id = $1 AND actor_kind = 'player'`,
    [session.user.id]
  );

  if (profiles.length === 0) {
    return Response.json({ error: "Hunter profile not found" }, { status: 404 });
  }

  const rank = profiles[0].rank;

  // Available dungeons: open + rank-eligible
  const dungeons = await query(
    `SELECT * FROM dungeon_instances
     WHERE status = 'open'
       AND min_rank <= $1
     ORDER BY
       CASE tier
         WHEN 'Red' THEN 7 WHEN 'S' THEN 6 WHEN 'A' THEN 5
         WHEN 'B' THEN 4 WHEN 'C' THEN 3 WHEN 'D' THEN 2 WHEN 'E' THEN 1
       END DESC,
       opened_at DESC`,
    [rank]
  );

  // Active dungeons the player is in
  const active = await query(
    `SELECT * FROM dungeon_instances
     WHERE status = 'active'
       AND $1 = ANY(participants)`,
    [session.user.id]
  );

  return Response.json({
    available: dungeons,
    active: active,
    rank,
  });
}