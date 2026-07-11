import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getEngine } from "@cambridge-tcg/play";
import "@/lib/game/registry-bootstrap"; // side-effect: registers engines
import { postActivity } from "@/lib/social/db";
import { grantPveRewardsIdempotent } from "@/lib/game/rewards";
import { resolveActor } from "@/lib/game/pve-actor";
import type { GameCard, GameState } from "@/lib/game/types";

// Fallback for pve_levels rows that pre-date the game_code migration
// (drizzle/drafts/0102_pve_game_code.sql.draft, unapplied). Once it lands
// and every row has a non-null value, this default becomes dead code.
const DEFAULT_GAME_CODE = "optcg";

// In PVE the human is always player1 and the AI is always player2.

// Upkeep actions the client may NOT send individually — they run as the
// composite `begin_turn` action (once per turn, enforced by the reducer's
// lastUpkeepTurn stamp). This closes the refresh_all+attack farming loop
// that let a scripted client win every game in one turn.
const UPKEEP_ONLY_VIA_BEGIN_TURN = new Set(["refresh_all", "draw_card", "add_don"]);

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
  /** Added by 0099_pve_game_code.sql. Until that migration applies on
   *  prod, the column is missing on existing rows; we fall back to
   *  DEFAULT_GAME_CODE = "optcg" at read time. */
  game_code?: string | null;
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

// PVE mirror of the hidden-zone mask in game/[code]/state — hidden zones
// never cross the wire. The human is always player1, so the AI's hand,
// deck, and life stay hidden; the player's OWN life is masked too (life
// is face-down in OPTCG, unknown even to its owner). Rarity is dropped as
// well — an "L" rarity in a masked zone would identify the Leader. Works
// on a copy; the persisted state keeps the real cards.
function maskHiddenZones(state: GameState): GameState {
  const s = JSON.parse(JSON.stringify(state)) as GameState;
  const hide = (c: GameCard): GameCard => ({
    ...c,
    sku: "",
    name: "?",
    cardNumber: "?",
    imageUrl: null,
    rarity: null,
    faceDown: true,
  });
  if (s.player2) {
    s.player2.hand = (s.player2.hand ?? []).map(hide);
    s.player2.deck = (s.player2.deck ?? []).map(hide);
    s.player2.life = (s.player2.life ?? []).map(hide);
  }
  if (s.player1) {
    s.player1.life = (s.player1.life ?? []).map(hide);
  }
  return s;
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
  const actor = await resolveActor(false);
  if (!actor) return NextResponse.json({ error: "No active game. Start one from /play." }, { status: 401 });

  const { levelId } = await params;
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required." }, { status: 400 });

  const level = await loadLevel(levelId);
  if (!level) return NextResponse.json({ error: "Level not found." }, { status: 404 });

  const game = await loadGame(gameId, actor.userId);
  if (!game) return NextResponse.json({ error: "Game not found." }, { status: 404 });

  return NextResponse.json({
    gameId: game.id,
    status: game.status,
    state: maskHiddenZones(game.game_state),
    opponent: opponentPayload(level),
    isGuest: actor.isGuest,
  });
}

// ── POST — start / action / ai_turn / victory / defeat ──────────────────

export async function POST(request: Request, { params }: { params: Promise<{ levelId: string }> }) {
  const body = await request.json();
  const isStart = body.action === "start";
  const actor = await resolveActor(isStart);
  if (!actor) return NextResponse.json({ error: "No active game. Start one from /play." }, { status: 401 });

  const { levelId } = await params;

  const level = await loadLevel(levelId);
  if (!level) return NextResponse.json({ error: "Level not found." }, { status: 404 });

  // Resolve which game engine the level wants. Falls back to OPTCG for
  // rows that pre-date the 0099_pve_game_code migration. Once migration
  // lands and every row has a non-null game_code, the fallback becomes
  // dead code.
  const gameCode = level.game_code ?? DEFAULT_GAME_CODE;
  const engine = getEngine(gameCode);
  if (!engine) {
    return NextResponse.json(
      { error: `Unknown game engine for code "${gameCode}". This level needs a registered engine.` },
      { status: 500 },
    );
  }

  // Gate: unlocks require previous level cleared. Guests use the same
  // pve_progress table — their cookie pins their progression to one
  // browser; clearing cookies resets to Lv.1.
  const unlockResult = await query(
    `SELECT MAX(l.level_number) as max_level FROM pve_progress p JOIN pve_levels l ON p.level_id=l.id WHERE p.user_id=$1 AND p.cleared=true`,
    [actor.userId],
  );
  const maxLevel = unlockResult.rows[0]?.max_level ?? 0;
  if (level.required_level > maxLevel) {
    return NextResponse.json({ error: `Complete level ${level.required_level} first.` }, { status: 403 });
  }

  // ── start new game ──
  if (isStart) {
    const playerDeck = body.deck;
    if (!Array.isArray(playerDeck) || playerDeck.length < 10) {
      return NextResponse.json({ error: "Load a deck first." }, { status: 400 });
    }
    if (!playerDeck.some((c: { isLeader?: boolean }) => c?.isLeader)) {
      return NextResponse.json(
        { error: "Your deck needs a Leader card. Grab a starter from /play/starters or set one in the deck builder." },
        { status: 400 },
      );
    }

    let aiDeck = level.ai_deck;
    if ((!Array.isArray(aiDeck) || aiDeck.length === 0) && engine.generateAIDeck) {
      // Catalog fetch is same-origin (works in dev/preview/prod alike) and
      // best-effort: on failure or an empty catalog we fall through.
      const origin = new URL(request.url).origin;
      const catalogData = await fetch(
        `${origin}/api/market/catalog?game=one-piece&set=${level.set_code || "OP01"}&limit=200`,
      )
        .then((r) => r.json())
        .catch(() => ({ cards: [] }));
      if (Array.isArray(catalogData.cards) && catalogData.cards.length > 0) {
        aiDeck = engine.generateAIDeck(level.set_code || "OP01", catalogData.cards);
      }
    }
    if (!Array.isArray(aiDeck) || aiDeck.length === 0) {
      // Last resort: the AI mirrors the player's deck. Always valid, always
      // available — a match can never fail to start because a catalog was
      // unreachable.
      aiDeck = playerDeck.map((c: Record<string, unknown>) => ({ ...c }));
    }

    const gameState = engine.initializeGame({
      humanUserId: actor.userId,
      humanName: actor.name,
      humanDeck: playerDeck,
      aiId: `ai_${level.id}`,
      aiName: level.opponent_name,
      aiDeck: (aiDeck as unknown[]) as Parameters<typeof engine.initializeGame>[0]["aiDeck"],
      levelHint: {
        levelNumber: level.level_number,
        setCode: level.set_code,
        difficulty: level.difficulty,
        aiAggression: Number.isFinite(parseFloat(level.ai_aggression))
          ? parseFloat(level.ai_aggression)
          : 0.5,
      },
    });

    const created = await query(
      `INSERT INTO pve_games (user_id, level_id, game_state, status) VALUES ($1,$2,$3,'playing') RETURNING id`,
      [actor.userId, level.id, JSON.stringify(gameState)],
    );

    return NextResponse.json({
      gameId: created.rows[0].id,
      state: maskHiddenZones(gameState as GameState),
      opponent: opponentPayload(level),
      isGuest: actor.isGuest,
      gameCode,
    });
  }

  // From here on, all actions operate on an existing game
  const { gameId } = body;
  if (!gameId) return NextResponse.json({ error: "gameId required." }, { status: 400 });

  const game = await loadGame(gameId, actor.userId);
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
    if (UPKEEP_ONLY_VIA_BEGIN_TURN.has(type)) {
      return NextResponse.json(
        { error: "Upkeep runs automatically at the start of your turn." },
        { status: 409 },
      );
    }
    const currentState: GameState = game.game_state;

    // Reject player moves when it isn't their turn (cheap anti-cheat).
    if (currentState.currentTurn !== actor.userId && type !== "concede") {
      return NextResponse.json({ error: "Not your turn." }, { status: 409 });
    }

    // The reducer leaves two side doors around the upkeep block above:
    // toggle_rest can un-rest an attacker mid-turn (attack → un-rest →
    // attack, unlimited), and move_card can lift cards out of the deck
    // (free draws). Both reopen the farming loop the set closes, so the
    // server rejects them; resting a card and every other move stay legal.
    if (type === "toggle_rest") {
      const cardId = (data as { cardId?: string } | undefined)?.cardId;
      const board = [
        currentState.player1.leader,
        ...currentState.player1.field,
        currentState.player1.stage,
      ].filter(Boolean) as GameCard[];
      const card = board.find((c) => c.id === cardId);
      if (card?.isRested) {
        return NextResponse.json(
          { error: "Rested cards refresh at the start of your next turn." },
          { status: 409 },
        );
      }
    }
    if (type === "move_card") {
      const cardId = (data as { cardId?: string } | undefined)?.cardId;
      if (currentState.player1.deck.some((c) => c.id === cardId)) {
        return NextResponse.json(
          { error: "Cards leave the deck only via the start-of-turn draw." },
          { status: 409 },
        );
      }
    }

    const newState = engine.applyAction(currentState, "player1", type, data ?? {}) as GameState;

    await query(
      `UPDATE pve_games SET game_state=$2, turn_number=$3 WHERE id=$1`,
      [gameId, JSON.stringify(newState), newState.turnNumber],
    );

    return NextResponse.json({ state: maskHiddenZones(newState) });
  }

  // ── AI turn — generated + applied server-side ──
  if (body.action === "ai_turn") {
    if (game.status !== "playing") {
      return NextResponse.json({ error: "Game is not active." }, { status: 409 });
    }
    const currentState: GameState = game.game_state;

    // AI may only act on its own turn
    if (currentState.currentTurn === actor.userId) {
      return NextResponse.json({ error: "AI cannot act on player turn." }, { status: 409 });
    }

    const parsed = parseFloat(level.ai_aggression);
    const aggression = Number.isFinite(parsed) ? parsed : 0.5;
    const decision = engine.aiTurn(currentState, "player2", { aiAggression: aggression });

    let nextState = currentState;
    const appliedActions: typeof decision.actions = [];
    const terminalSet = new Set(engine.terminalPhases);
    for (const action of decision.actions) {
      nextState = engine.applyAction(nextState, "player2", action.type, action.data) as GameState;
      appliedActions.push(action);
      if (terminalSet.has(nextState.phase)) break;
    }

    await query(
      `UPDATE pve_games SET game_state=$2, turn_number=$3 WHERE id=$1`,
      [gameId, JSON.stringify(nextState), nextState.turnNumber],
    );

    return NextResponse.json({
      actions: appliedActions,
      thinking: decision.thinking,
      state: maskHiddenZones(nextState),
    });
  }

  // ── victory — verified against persisted state ──
  if (body.action === "victory") {
    const state: GameState = game.game_state;
    const result = engine.victoryCheck(state, actor.userId);
    if (!result) {
      return NextResponse.json(
        { error: "Game is not in a victorious state." },
        { status: 409 },
      );
    }
    if (game.status !== "playing") {
      // Already processed — return the earlier result shape idempotently
      return NextResponse.json({ victory: true, alreadyClaimed: true });
    }

    const turnsPlayed = result.turnsPlayed;
    // OPTCG-specific summary lifts; future engines may surface
    // different shapes here. The pve_progress row tracks "best_life_remaining"
    // for OPTCG; other games can reinterpret or skip it.
    const lifeRemaining = (result.summary.lifeRemaining as number | undefined) ?? null;

    // Status guard makes concurrent victory POSTs race-safe: exactly one
    // request flips the row and proceeds to grant rewards; the rest take
    // the idempotent alreadyClaimed exit (the status read above is stale
    // by the time we get here).
    const flipped = await query(
      `UPDATE pve_games SET status='won', result='win', ended_at=NOW() WHERE id=$1 AND status='playing'`,
      [gameId],
    );
    if (flipped.rowCount === 0) {
      return NextResponse.json({ victory: true, alreadyClaimed: true });
    }

    const progressResult = await query(
      `SELECT * FROM pve_progress WHERE user_id=$1 AND level_id=$2`,
      [actor.userId, level.id],
    );
    const isFirstClear = progressResult.rows.length === 0 || !progressResult.rows[0].cleared;

    // The next level's row id — the client navigates by id, not by
    // level_number (they only coincide on a fresh seed). Null after the
    // final level.
    const nextLevelRow = await query(
      `SELECT id FROM pve_levels WHERE level_number=$1 AND is_active=true LIMIT 1`,
      [level.level_number + 1],
    );
    const nextLevelId: number | null = nextLevelRow.rows[0]?.id ?? null;

    // Guests record clear progression (so they can unlock the next level)
    // but receive no monetary rewards and no public activity post.
    if (actor.isGuest) {
      await query(
        `INSERT INTO pve_progress (user_id, level_id, cleared, clear_count, best_turns, best_life_remaining, total_points_earned, first_cleared_at)
         VALUES ($1, $2, true, 1, $3, $4, 0, NOW())
         ON CONFLICT (user_id, level_id) DO UPDATE SET
           cleared=true, clear_count=pve_progress.clear_count+1,
           best_turns=LEAST(pve_progress.best_turns, $3),
           best_life_remaining=GREATEST(pve_progress.best_life_remaining, $4),
           last_played_at=NOW()`,
        [actor.userId, level.id, turnsPlayed || null, lifeRemaining || null],
      );

      return NextResponse.json({
        victory: true,
        firstClear: isFirstClear,
        guestMode: true,
        // Surface zero earnings honestly — substrate honesty rule 1: don't
        // lie to the surface about what happened.
        pointsEarned: 0,
        creditEarned: 0,
        pullTokenEarned: 0,
        dailyBonusEarned: false,
        level: level.level_number,
        nextLevelId,
        signInPromptUrl: "/api/auth/signin?callbackUrl=/play",
      });
    }

    // All reward grants flow through the idempotent helper — it computes
    // the multiplied Berries total exactly once and that same number feeds
    // the ledger, the progress row, and the response (no second calc that
    // could diverge). If this throws partway, the cron sweep
    // (runPveReconciliationSweep) finds the unawarded game and resumes from
    // wherever the per-leg ledger checks say is already done.
    const grant = await grantPveRewardsIdempotent({
      gameId,
      userId: actor.userId,
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

    await query(
      `INSERT INTO pve_progress (user_id, level_id, cleared, clear_count, best_turns, best_life_remaining, total_points_earned, first_cleared_at)
       VALUES ($1, $2, true, 1, $3, $4, $5, NOW())
       ON CONFLICT (user_id, level_id) DO UPDATE SET
         cleared=true, clear_count=pve_progress.clear_count+1,
         best_turns=LEAST(pve_progress.best_turns, $3),
         best_life_remaining=GREATEST(pve_progress.best_life_remaining, $4),
         total_points_earned=pve_progress.total_points_earned+$5,
         last_played_at=NOW()`,
      [actor.userId, level.id, turnsPlayed || null, lifeRemaining || null, grant.pointsEarned],
    );

    postActivity(
      actor.userId,
      "achievement_earned",
      `Defeated ${level.opponent_name} in ${level.title}!`,
    ).catch(() => {});

    return NextResponse.json({
      victory: true,
      firstClear: isFirstClear,
      pointsEarned: grant.pointsEarned,
      creditEarned: grant.creditEarned,
      pullTokenEarned: grant.pullTokenEarned,
      dailyBonusEarned: grant.dailyBonusEarned,
      earnBreakdown: grant.earnBreakdown,
      level: level.level_number,
      nextLevelId,
    });
  }

  // ── defeat — verified against persisted state ──
  if (body.action === "defeat") {
    const state: GameState = game.game_state;
    const legitimateDefeat =
      state.phase === "finished" && state.winner && state.winner !== actor.userId;
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
