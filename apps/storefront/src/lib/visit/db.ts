/**
 * Visit-rewards persistence — the Daily Flame's memory.
 *
 * The RULES live in @cambridge-tcg/visit (pure compute, no DB — same split
 * as @cambridge-tcg/pricing). This module is the thin storage layer the
 * /api/visit/* routes call: it remembers what happened, it decides nothing.
 *
 * Time discipline: "today" is always the DATABASE's CURRENT_DATE (UTC on
 * RDS), fetched via getDbToday(). The app server's wall clock is never the
 * authority on which day it is — one clock, the database's.
 *
 * Every write here is idempotent by constraint (UNIQUE(user_id, day) on
 * check-ins, UNIQUE(user_id, badge_key) on badges, UNIQUE(user_id,
 * quest_key, week) on quests), so a retried request re-lands harmlessly.
 *
 * Schema: drizzle/0103_daily_flame.sql.
 */

import { query } from "@/lib/db";
import {
  type FlameState,
  type QuestDef,
  WEEKLY_QUESTS,
  emptyFlame,
} from "@cambridge-tcg/visit";

/** The database's idea of today, as YYYY-MM-DD. */
export async function getDbToday(): Promise<string> {
  const r = await query(`SELECT CURRENT_DATE::text AS today`);
  return r.rows[0].today;
}

/**
 * Record today's check-in. Returns true when this call created the row
 * (first check-in of the day); false when the day was already checked in.
 */
export async function recordCheckin(userId: string): Promise<boolean> {
  const r = await query(
    `INSERT INTO visit_checkins (user_id, day)
     VALUES ($1, CURRENT_DATE)
     ON CONFLICT (user_id, day) DO NOTHING
     RETURNING id`,
    [userId],
  );
  return r.rows.length > 0;
}

export async function hasCheckedInToday(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM visit_checkins WHERE user_id = $1 AND day = CURRENT_DATE`,
    [userId],
  );
  return r.rows.length > 0;
}

export async function loadFlame(userId: string): Promise<FlameState | null> {
  const r = await query(
    `SELECT length, embers_used_week, ember_week, last_day::text AS last_day, shards
       FROM visit_flames WHERE user_id = $1`,
    [userId],
  );
  if (r.rows.length === 0) return null;
  const row = r.rows[0];
  return {
    length: row.length,
    embersUsedWeek: row.embers_used_week,
    emberWeek: row.ember_week,
    lastDay: row.last_day,
    shards: row.shards,
  };
}

export async function saveFlame(userId: string, state: FlameState): Promise<void> {
  await query(
    `INSERT INTO visit_flames (user_id, length, embers_used_week, ember_week, last_day, shards, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       length = EXCLUDED.length,
       embers_used_week = EXCLUDED.embers_used_week,
       ember_week = EXCLUDED.ember_week,
       last_day = EXCLUDED.last_day,
       shards = EXCLUDED.shards,
       updated_at = NOW()`,
    [userId, state.length, state.embersUsedWeek, state.emberWeek, state.lastDay, state.shards],
  );
}

/** Add badge shards; returns the new total. Creates the flame row if absent. */
export async function addShards(userId: string, n: number): Promise<number> {
  const r = await query(
    `INSERT INTO visit_flames (user_id, shards, updated_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       shards = visit_flames.shards + EXCLUDED.shards,
       updated_at = NOW()
     RETURNING shards`,
    [userId, n],
  );
  return r.rows[0].shards;
}

/**
 * Award a badge idempotently. Returns true if this call earned it (first
 * time), false if the user already had it. `drawId` threads the proof for
 * pack-earned badges (visit_badges.draw_id → verifiable_draws).
 */
export async function awardBadge(
  userId: string,
  badgeKey: string,
  drawId?: string | null,
): Promise<boolean> {
  const r = await query(
    `INSERT INTO visit_badges (user_id, badge_key, draw_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, badge_key) DO NOTHING
     RETURNING id`,
    [userId, badgeKey, drawId ?? null],
  );
  return r.rows.length > 0;
}

export interface BadgeRow {
  badge_key: string;
  earned_at: string;
  draw_id: string | null;
}

export async function loadBadges(userId: string): Promise<BadgeRow[]> {
  const r = await query(
    `SELECT badge_key, earned_at, draw_id
       FROM visit_badges WHERE user_id = $1
      ORDER BY earned_at DESC`,
    [userId],
  );
  return r.rows;
}

/** Ensure this week's quest rows exist (progress 0). Idempotent. */
export async function seedWeekQuests(userId: string, week: string): Promise<void> {
  for (const q of WEEKLY_QUESTS) {
    await query(
      `INSERT INTO visit_quests (user_id, quest_key, week)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, quest_key, week) DO NOTHING`,
      [userId, q.key, week],
    );
  }
}

export interface QuestProgressResult {
  quest_key: string;
  progress: number;
  target: number;
  completed: boolean;
  /** True only on the call that crossed the finish line. */
  just_completed: boolean;
}

/**
 * Advance a quest by `amount`, capped at its target. Sets completed_at
 * exactly once; `just_completed` is true only for the crossing call.
 */
export async function progressQuest(
  userId: string,
  quest: QuestDef,
  week: string,
  amount: number = 1,
): Promise<QuestProgressResult> {
  const r = await query(
    `INSERT INTO visit_quests (user_id, quest_key, week, progress, completed_at, updated_at)
     VALUES ($1, $2, $3, LEAST($4::int, $5::int), CASE WHEN $4::int >= $5::int THEN NOW() END, NOW())
     ON CONFLICT (user_id, quest_key, week) DO UPDATE SET
       progress = LEAST(visit_quests.progress + $4::int, $5::int),
       completed_at = COALESCE(
         visit_quests.completed_at,
         CASE WHEN visit_quests.progress + $4::int >= $5::int THEN NOW() END
       ),
       updated_at = NOW()
     RETURNING progress,
               completed_at IS NOT NULL AS completed,
               (completed_at IS NOT NULL AND completed_at = updated_at) AS just_completed`,
    [userId, quest.key, week, amount, quest.target],
  );
  const row = r.rows[0];
  return {
    quest_key: quest.key,
    progress: row.progress,
    target: quest.target,
    completed: row.completed,
    just_completed: row.just_completed,
  };
}

export interface QuestRow {
  quest_key: string;
  progress: number;
  completed_at: string | null;
}

export async function loadWeekQuests(userId: string, week: string): Promise<QuestRow[]> {
  const r = await query(
    `SELECT quest_key, progress, completed_at
       FROM visit_quests WHERE user_id = $1 AND week = $2`,
    [userId, week],
  );
  return r.rows;
}

/** All four quests done this week? (Drives the `quartet` badge.) */
export async function allQuestsCompleted(userId: string, week: string): Promise<boolean> {
  const r = await query(
    `SELECT COUNT(*)::int AS done
       FROM visit_quests
      WHERE user_id = $1 AND week = $2 AND completed_at IS NOT NULL`,
    [userId, week],
  );
  return r.rows[0].done >= WEEKLY_QUESTS.length;
}

/** Today's daily-pack draw, if one was already committed. */
export async function todaysPackDraw(
  userId: string,
): Promise<{ id: string; outcome: { picked?: string } | null } | null> {
  const r = await query(
    `SELECT id, outcome
       FROM verifiable_draws
      WHERE kind = 'daily_pack' AND user_id = $1
        AND committed_at::date = CURRENT_DATE
      ORDER BY committed_at ASC
      LIMIT 1`,
    [userId],
  );
  return r.rows.length > 0 ? r.rows[0] : null;
}

export { emptyFlame };
