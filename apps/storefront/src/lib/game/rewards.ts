// Idempotent PVE reward grant.
//
// The victory handler used to call earnPoints / addCredit / grantPullToken
// inline after flipping pve_games.status='won'. If the request crashed
// between those calls, the user got a "won" game with no rewards and no
// way to re-claim (idempotency check refused subsequent victory POSTs).
//
// This helper centralises the grant logic and uses ledger lookups by
// reference_id (the game's UUID) to detect "already granted" — so it's
// safe to run from both the live victory handler AND the reconciliation
// sweep cron without double-paying.
//
// On success, stamps pve_games.awarded_at so future sweeps skip this game.

import { query } from "@/lib/db";
import { earnPoints, addCredit } from "@/lib/membership/db";
import { grantPullToken, type PullTier } from "@/lib/bounty/db";
import { calculateBerriesEarn } from "@/lib/bounty/earn";

export const MILESTONE_PULLS: Record<number, PullTier> = {
  3:  "uncommon",
  6:  "rare",
  10: "super_rare",
};

export interface PveGrantResult {
  pointsEarned: number;
  creditEarned: number;
  pullTokenEarned: PullTier | null;
  dailyBonusEarned: PullTier | null;
  alreadyGranted: { points: boolean; credit: boolean; pull: boolean; daily: boolean };
}

const DAILY_BONUS_TIER: PullTier = "common";

interface PveGrantInput {
  gameId: string;
  userId: string;
  level: {
    id: number;
    title: string;
    level_number: number;
    first_clear_points: number;
    repeat_points: number;
    first_clear_credit: string | number | null;
  };
  isFirstClear: boolean;
}

export async function grantPveRewardsIdempotent(input: PveGrantInput): Promise<PveGrantResult> {
  const { gameId, userId, level, isFirstClear } = input;

  // Detect prior grants by reference_id. The victory handler uses gameId as
  // reference_id on both ledger types; same for the milestone pull below.
  // If a prior write succeeded, we skip that leg.
  const [pointsExisting, creditExisting, pullExisting] = await Promise.all([
    query(
      `SELECT 1 FROM points_ledger WHERE reference_id = $1 AND type = 'manual_credit' LIMIT 1`,
      [gameId]
    ),
    query(
      `SELECT 1 FROM store_credit_ledger WHERE reference_id = $1 AND type = 'manual_adjustment' LIMIT 1`,
      [gameId]
    ),
    query(
      `SELECT 1 FROM bounty_token_grants WHERE source = 'pve_milestone' AND source_reference_id = $1 LIMIT 1`,
      [gameId]
    ).catch(() => ({ rows: [] })),  // table may not exist yet on pre-migration deployments
  ]);
  const alreadyGranted = {
    points: pointsExisting.rows.length > 0,
    credit: creditExisting.rows.length > 0,
    pull: pullExisting.rows.length > 0,
  };

  // ── Points (with multipliers) ──
  let pointsEarned = 0;
  if (!alreadyGranted.points) {
    const earn = await calculateBerriesEarn({
      userId,
      levelId: level.id,
      baseFirstClear: level.first_clear_points,
      baseRepeat: level.repeat_points,
      isFirstClear,
    });
    if (earn.total > 0) {
      const multParts: string[] = [];
      if (earn.dailyMultiplier < 1) multParts.push(`${Math.round(earn.dailyMultiplier * 100)}% daily`);
      if (earn.streakMultiplier > 1) multParts.push(`${earn.streakMultiplier.toFixed(2)}x streak`);
      if (earn.tierMultiplier > 1) multParts.push(`${earn.tierMultiplier.toFixed(2)}x tier`);
      const multSuffix = multParts.length ? ` [${multParts.join(", ")}]` : "";
      await earnPoints(
        userId,
        earn.total,
        "manual_credit",
        `PVE Victory: ${level.title} (${isFirstClear ? "first clear" : "repeat"})${multSuffix}`,
        gameId,
      );
      pointsEarned = earn.total;
    }
  }

  // ── First-clear credit ──
  //
  // Yu 2026-05-14: "MAKE IT PURELY FOR FUN!!!! MINIMUM BARRIERS, MAXIMUM
  // FUNNNNNN!!!" The play module is fun-only. The substrate used to grant
  // real store credit on first-clear (the `first_clear_credit` column on
  // pve_levels). That contradicted the prose on /play/welcome, /play/casual,
  // and /play/compete — and the UI rendering was stripped in the prior
  // commit (cdd6077). This is the source-of-truth short-circuit: we never
  // grant credit again, regardless of what pve_levels.first_clear_credit
  // contains. The column and the input plumbing stay so a future
  // play-to-earn opt-in can re-attach prizes here under an explicit gate.
  const creditEarned = 0;
  // Intentionally NOT calling addCredit(). The variable + the
  // `first_clear_credit` plumbing in PveGrantInput remain so the typed
  // contract is unchanged; the value never leaves zero.
  void addCredit; // referenced only for the comment above; keep the import
  void level.first_clear_credit;
  void isFirstClear;
  void alreadyGranted.credit;

  // ── Milestone pull token ──
  let pullTokenEarned: PullTier | null = null;
  const milestoneTier = isFirstClear ? MILESTONE_PULLS[level.level_number] : undefined;
  if (!alreadyGranted.pull && milestoneTier) {
    await grantPullToken(userId, milestoneTier, 1, {
      source: "pve_milestone",
      sourceReferenceId: gameId,
      description: `Milestone: ${level.title} first clear`,
    });
    pullTokenEarned = milestoneTier;
  }

  // ── Daily PVE bonus pull token ──
  // First win each UTC day grants one common pull. Idempotency is
  // enforced by the (user_id, bonus_date) PK on pve_daily_bonuses; a
  // duplicate insert (same-day second win, sweep replay) silently no-ops.
  let dailyBonusEarned: PullTier | null = null;
  let dailyAlready = false;
  try {
    const claim = await query(
      `INSERT INTO pve_daily_bonuses (user_id, bonus_date, tier_granted, game_id)
       VALUES ($1, (NOW() AT TIME ZONE 'UTC')::date, $2, $3)
       ON CONFLICT (user_id, bonus_date) DO NOTHING
       RETURNING tier_granted`,
      [userId, DAILY_BONUS_TIER, gameId]
    );
    if (claim.rowCount && claim.rowCount > 0) {
      // We won the daily race — grant the token.
      await grantPullToken(userId, DAILY_BONUS_TIER, 1, {
        source: "pve_daily",
        sourceReferenceId: gameId,
        description: `Daily PVE bonus`,
      });
      dailyBonusEarned = DAILY_BONUS_TIER;
    } else {
      dailyAlready = true;
    }
  } catch (err) {
    // Table may not exist on pre-migration deployments; silent skip.
    console.error("[pve-rewards] daily bonus claim failed:", err);
  }

  // Stamp awarded_at so the sweep skips this game next tick. Even if every
  // leg was a no-op (alreadyGranted), stamping closes the door.
  await query(
    `UPDATE pve_games SET awarded_at = NOW() WHERE id = $1 AND awarded_at IS NULL`,
    [gameId]
  );

  return {
    pointsEarned,
    creditEarned,
    pullTokenEarned,
    dailyBonusEarned,
    alreadyGranted: { ...alreadyGranted, daily: dailyAlready },
  };
}
