import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoom, initializeGame } from "@/lib/game/engine";
import { query } from "@/lib/db";

// POST — submit deck and start game
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { code } = await params;
  const body = await request.json();

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const isP1 = room.player1_id === session.user.id;
  const isP2 = room.player2_id === session.user.id;
  if (!isP1 && !isP2) return NextResponse.json({ error: "You're not in this game." }, { status: 403 });

  // Store this player's deck in the game state
  const deck = body.deck as { sku: string; name: string; cardNumber: string; imageUrl: string | null; rarity: string | null; isLeader?: boolean }[];
  if (!deck || deck.length < 10) return NextResponse.json({ error: "Deck must have at least 10 cards." }, { status: 400 });
  if (!deck.some((c) => c?.isLeader)) {
    return NextResponse.json({ error: "Your deck needs a Leader card. Grab a starter from /play/starters or set one in the deck builder." }, { status: 400 });
  }

  // Atomic jsonb merge — both players submitting inside the same poll
  // window must not clobber each other's deck (the old read-modify-write
  // lost one deck and soft-locked the room).
  const stateKey = isP1 ? "p1_deck" : "p2_deck";
  const merged = await query(
    `UPDATE game_rooms
     SET game_state = COALESCE(game_state, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
         last_action_at = NOW()
     WHERE code=$1
     RETURNING game_state`,
    [code.toUpperCase(), stateKey, JSON.stringify(deck)]
  );
  const currentState = merged.rows[0].game_state;

  // Check if both players submitted decks
  if (currentState.p1_deck && currentState.p2_deck) {
    // Initialize the full game
    const gameState = initializeGame(
      room.player1_id, room.player1_name,
      currentState.p1_deck,
      room.player2_id, room.player2_name,
      currentState.p2_deck
    );

    // Guard: only the first request to see both decks initializes — a
    // concurrent double-init would re-shuffle and erase the other's write.
    const init = await query(
      `UPDATE game_rooms SET game_state=$2, status='playing', current_turn=$3, phase='main', last_action_at=NOW()
       WHERE code=$1 AND (game_state->'player1') IS NULL`,
      [code.toUpperCase(), JSON.stringify(gameState), gameState.currentTurn]
    );
    if (init.rowCount === 0) {
      // The other player's request initialized first — fine.
      return NextResponse.json({ started: true });
    }

    return NextResponse.json({ started: true, firstPlayer: gameState.firstPlayer });
  }

  return NextResponse.json({ waiting: true, message: "Deck submitted. Waiting for opponent." });
}
