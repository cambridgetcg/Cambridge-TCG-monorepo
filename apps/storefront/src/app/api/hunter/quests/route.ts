// Daily Quests — GET /api/hunter/quests
// Returns the player's daily quests, generating fresh ones if needed.
// Solo Leveling: "Daily Quest — Preparation to become a powerful hunter."

import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { generateDailyQuests } from "@cambridge-tcg/hunter";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get hunter profile
  const profiles = await query(
    `SELECT * FROM hunter_profiles WHERE actor_id = $1 AND actor_kind = 'player'`,
    [session.user.id]
  );

  if (profiles.length === 0) {
    return Response.json({ error: "Hunter profile not found" }, { status: 404 });
  }

  const profile = profiles[0];

  // Check if today's quests exist
  const today = new Date().toISOString().slice(0, 10);
  const existing = await query(
    `SELECT * FROM daily_quests
     WHERE hunter_profile_id = $1
       AND created_at::text LIKE $2
       AND expires_at > NOW()`,
    [profile.id, today + "%"]
  );

  if (existing.length > 0) {
    return Response.json({ quests: existing });
  }

  // Generate fresh daily quests
  const newQuests = generateDailyQuests(profile.level);
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);

  const inserted = [];
  for (const q of newQuests) {
    const rows = await query(
      `INSERT INTO daily_quests (hunter_profile_id, quest_type, description, xp_reward, target, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [profile.id, q.type, q.description, q.xpReward, q.target, expiresAt.toISOString()]
    );
    if (rows.length > 0) inserted.push(rows[0]);
  }

  return Response.json({ quests: inserted, message: "New daily quests have appeared. Arise." });
}