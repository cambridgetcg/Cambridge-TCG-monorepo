import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { resolveActor } from "@/lib/game/pve-actor";
import { PVE_AVAILABILITY } from "@/lib/game/pve-availability";
import type { GameCard, GameState } from "@/lib/game/types";

interface PVELevel {
  id: number;
  level_number: number;
  title: string;
  opponent_name: string;
  opponent_icon: string;
  difficulty: string;
}

async function loadLevel(levelId: string): Promise<PVELevel | null> {
  const result = await query(
    `SELECT id, level_number, title, opponent_name, opponent_icon, difficulty
       FROM pve_levels
      WHERE id=$1 AND is_active=true`,
    [levelId],
  );
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ levelId: string }> },
) {
  const actor = await resolveActor(false);
  if (!actor) {
    return NextResponse.json(
      { error: "Sign in required. Guest game persistence is paused." },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  const { levelId } = await params;
  const url = new URL(request.url);
  const gameId = url.searchParams.get("gameId");
  if (!gameId)
    return NextResponse.json({ error: "gameId required." }, { status: 400 });

  const level = await loadLevel(levelId);
  if (!level)
    return NextResponse.json({ error: "Level not found." }, { status: 404 });

  const game = await loadGame(gameId, actor.userId);
  if (!game)
    return NextResponse.json({ error: "Game not found." }, { status: 404 });

  return NextResponse.json(
    {
      gameId: game.id,
      status: game.status,
      state: maskHiddenZones(game.game_state),
      opponent: opponentPayload(level),
      isGuest: actor.isGuest,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

// All durable PVE mutations are closed before auth, params, body, or database
// work. The rules engine does not yet prove complete deck and action legality,
// so accepting battles here would make durable rewards exploitable.
export function POST(
  request: Request,
  context: { params: Promise<{ levelId: string }> },
) {
  void request;
  void context;
  return NextResponse.json(
    { error: PVE_AVAILABILITY.reason, ...PVE_AVAILABILITY },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": "86400",
      },
    },
  );
}
