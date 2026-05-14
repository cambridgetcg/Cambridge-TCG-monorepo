import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";
import { initializeGame } from "@/lib/game/engine";
import { applyAction } from "@/lib/game/reducer";
import { aiTurn, generateAIDeck } from "@/lib/game/ai";
import { postActivity } from "@/lib/social/db";
import { calculateBerriesEarn } from "@/lib/bounty/earn";
import { grantPveRewardsIdempotent } from "@/lib/game/rewards";
import type { GameState } from "@/lib/game/types";

// In PVE the human is always player1 and the AI is always player2.
// Keep this assumption in one place.
const HUMAN_KEY = "player1" as const;
const AI_KEY = "player2" as const;

interface PVELevel {
  id: number;
  level_number: number;
  title: string;
  opponent_name: string;
  opponent_icon: string;
  difficulty: string;
  ai_aggression: string;
  ai_deck: unknown[];
  set_code: string | null;
  required_level: number;
  first_clear_points: number;
  first_clear_credit: string;
  repeat_points: number;
  is_active: boolean;
}

async function loadLevel(levelId: string): Promise<PVELevel | null> {
  const result = await query(`SELECT * FROM pve_levels WHERE id=$1 AND is_active=true`, [levelId]);
  return result.rows[0] ?? null;
}

async function loadGame(gameId: string, userId: string) {
  const result = await query(
    `SELECT id, user_id, level_id, game_state, status, turn_number FROM pve_games WHERE id=$1 AND user_id=$2`,
    [gameId, userId],
  );
  return result.rows[0] ?? null;
}

function opponentPayload(level: PVELevel) {
  return {
    name: level.opponent_name,
    icon: level.opponent_icon,
    difficulty: level.difficulty,
    level_number: level.level_number,
    title: level.title,
  };
}

// ── GET — resume an in-progress game ────────────────────────────────────

export async function GET(request: Request, { params }: { params: Promise<{ levelId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { levelId } = await params;
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required." }, { status: 400 });

  const level = await loadLevel(levelId);
  if (!level) return NextResponse.json({ error: "Level not found." }, { status: 404 });

  const game = await loadGame(gameId, session.user.id);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  return NextResponse.json({
    gameId: game.id,
    status: game.status,
    state: game.game_state,
    opponent: opponentPayload(level),
  });
}

// ── POST — start / action / ai_turn / victory / defeat ──────────────────

export async function POST(request: Request, { params }: { params: Promise<{ levelId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { levelId } = await params;
  const body = await request.json();

  const level = await loadLevel(levelId);
  if (!level) return NextResponse.json({ error: "Level not found." }, { status: 404 });

  // Gate: unlocks require previous level cleared
  const unlockResult = await query(
    `SELECT MAX(l.level_number) as max_level FROM pve_progress p JOIN pve_levels l ON p.level_id=l.id WHERE p.user_id=$1 AND p.cleared=true`,
    [session.user.id],
  );
  const maxLevel = unlockResult.rows[0]?.max_level ?? 0;
  if (level.required_level > maxLevel) {
    return NextResponse.json({ error: `Complete level ${level.required_level} first.` }, { status: 403 });
  }

  // ── start new game ──
  if (body.action === "start") {
    const playerDeck = body.deck;
    if (!Array.isArray(playerDeck) || playerDeck.length < 10) {
      return NextResponse.json({ error: "Load a deck first." }, { status: 400 });
    }

    let aiDeck = level.ai_deck;
    if (!Array.isArray(aiDeck) || aiDeck.length === 0) {
      const catalogRes = await fetch(
        `https://cambridgetcg.com/api/market/catalog?game=one-piece&set=${level.set_code || "OP01"}&limit=200`,
      );
      const catalogData = await catalogRes.json().catch(() => ({ cards: [] }));
      aiDeck = generateAIDeck(level.set_code || "OP01", catalogData.cards || []);
    }

    const gameState = initializeGame(
      session.user.id,
      session.user.name || "Player",
      playerDeck,
      `ai_${level.id}`,
      level.opponent_name,
      aiDeck as Parameters<typeof initializeGame>[5],
    );

    const created = await query(
      `INSERT INTO pve_games (user_id, level_id, game_state, status) VALUES ($1,$2,$3,'playing') RETURNING id`,
      [session.user.id, level.id, JSON.stringify(gameState)],
    );

    return NextResponse.json({
      gameId: created.rows[0].id,
      state: gameState,
      opponent: opponentPayload(level),
    });
  }

  // From here on, all actions operate on an existing game
  const { gameId } = body;
  if (!gameId) return NextResponse.json({ error: "gameId required." }, { status: 400 });

  const game = await loadGame(gameId, session.user.id);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  // ── player action — applied server-side, persisted ──
  if (body.action === "action") {
    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not active." }, { status: 409 });
    }
    const { type, data } = body as { type: string; data: Record<string, unknown> };
    if (typeof type !== "string") {
      return NextResponse.json({ error: "Invalid action type." }, { status: 400 });
    }
    const currentState: GameState = game.game_state;

    // Reject player moves when it isn't their turn (cheap anti-cheat).
    if (currentState.currentTurn !== session.user.id && type !== "concede") {
      return NextResponse.json({ error: "Not your turn." }, { status: 409 });
    }

    const newState = applyAction(currentState, HUMAN_KEY, type, data ?? {});

    await query(
      `UPDATE pve_games SET game_state=$2, turn_number=$3 WHERE id=$1`,
      [gameId, JSON.stringify(newState), newState.turnNumber],
    );

    return NextResponse.json({ state: newState });
  }

  // ── AI turn — generated + applied server-side ──
  if (body.action === "ai_turn") {
    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not active." }, { status: 409 });
    }
    const currentState: GameState = game.game_state;

    // AI may only act on its own turn
    if (currentState.currentTurn === session.user.id) {
      return NextResponse.json({ error: "AI cannot act on player turn." }, { status: 409 });
    }

    const aggression = parseFloat(level.ai_aggression);
    const decision = aiTurn(currentState, AI_KEY, aggression);

    let nextState = currentState;
    const appliedActions: typeof decision.actions = [];
    for (const action of decision.actions) {
      nextState = applyAction(nextState, AI_KEY, action.type, action.data);
      appliedActions.push(action);
      if (nextState.phase === "finished") break;
    }

    await query(
      `UPDATE pve_games SET game_state=$2, turn_number=$3 WHERE id=$1`,
      [gameId, JSON.stringify(nextState), nextState.turnNumber],
    );

    return NextResponse.json({
      actions: appliedActions,
      thinking: decision.thinking,
      state: nextState,
    });
  }

  // ── victory — verified against persisted state ──
  if (body.action === "victory") {
    const state: GameState = game.game_state;
    if (state.phase !== "finished" || state.winner !== session.user.id) {
      return NextResponse.json(
        { error: "Game is not in a victorious state." },
        { status: 409 },
      );
    }
    if (game.status !== "playing") {
      // Already processed — return the earlier result shape idempotently
      return NextResponse.json({ victory: true, alreadyClaimed: true });
    }

    const turnsPlayed = state.turnNumber;
    const lifeRemaining = state.player1.lifeCount;

    await query(
      `UPDATE pve_games SET status='won', result='win', ended_at=NOW() WHERE id=$1`,
      [gameId],
    );

    const progressResult = await query(
      `SELECT * FROM pve_progress WHERE user_id=$1 AND level_id=$2`,
      [session.user.id, level.id],
    );
    const isFirstClear = progressResult.rows.length === 0 || !progressResult.rows[0].cleared;

    // Apply streak + tier + daily-diminishing multipliers on top of the base.
    const earn = await calculateBerriesEarn({
      userId: session.user.id,
      levelId: level.id,
      baseFirstClear: level.first_clear_points,
      baseRepeat: level.repeat_points,
      isFirstClear,
    });

    await query(
      `INSERT INTO pve_progress (user_id, level_id, cleared, clear_count, best_turns, best_life_remaining, total_points_earned, first_cleared_at)
       VALUES ($1, $2, true, 1, $3, $4, $5, NOW())
       ON CONFLICT (user_id, level_id) DO UPDATE SET
         cleared=true, clear_count=pve_progress.clear_count+1,
         best_turns=LEAST(pve_progress.best_turns, $3),
         best_life_remaining=GREATEST(pve_progress.best_life_remaining, $4),
         total_points_earned=pve_progress.total_points_earned+$5,
         last_played_at=NOW()`,
      [session.user.id, level.id, turnsPlayed || null, lifeRemaining || null, earn.total],
    );

    // All reward grants now flow through the idempotent helper. If this
    // throws partway, the cron sweep (runPveReconciliationSweep) finds the
    // unawarded game and resumes from wherever the per-leg ledger checks
    // say is already done.
    const grant = await grantPveRewardsIdempotent({
      gameId,
      userId: session.user.id,
      level: {
        id: level.id,
        title: level.title,
        level_number: level.level_number,
        first_clear_points: level.first_clear_points,
        repeat_points: level.repeat_points,
        first_clear_credit: level.first_clear_credit,
      },
      isFirstClear,
    });
    const credit = grant.creditEarned;
    const milestonePull = grant.pullTokenEarned;
    const dailyBonus = grant.dailyBonusEarned;

    postActivity(
      session.user.id,
      "achievement_earned",
      `Defeated ${level.opponent_name} in ${level.title}!`,
    ).catch(() => {});

    return NextResponse.json({
      victory: true,
      firstClear: isFirstClear,
      pointsEarned: earn.total,
      creditEarned: credit,
      pullTokenEarned: milestonePull,
      dailyBonusEarned: dailyBonus,
      earnBreakdown: {
        base: earn.base,
        dailyMultiplier: earn.dailyMultiplier,
        streakMultiplier: earn.streakMultiplier,
        tierMultiplier: earn.tierMultiplier,
        clearsToday: earn.clearsToday,
        currentStreak: earn.currentStreak,
      },
      level: level.level_number,
      nextLevel: level.level_number + 1,
    });
  }

  // ── defeat — verified against persisted state ──
  if (body.action === "defeat") {
    const state: GameState = game.game_state;
    const legitimateDefeat =
      state.phase === "finished" && state.winner && state.winner !== session.user.id;
    const isConcede = body.concede === true;

    if (!legitimateDefeat && !isConcede) {
      return NextResponse.json(
        { error: "Game is not in a defeat state." },
        { status: 409 },
      );
    }

    await query(
      `UPDATE pve_games SET status='lost', result='loss', ended_at=NOW() WHERE id=$1 AND status='playing'`,
      [gameId],
    );
    return NextResponse.json({ defeat: true, message: "Try again! Your deck is ready." });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
