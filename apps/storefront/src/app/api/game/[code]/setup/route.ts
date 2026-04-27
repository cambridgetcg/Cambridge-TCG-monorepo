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

  const stateKey = isP1 ? "p1_deck" : "p2_deck";
  const currentState = room.game_state || {};
  currentState[stateKey] = deck;

  // Check if both players submitted decks
  if (currentState.p1_deck && currentState.p2_deck) {
    // Initialize the full game
    const gameState = initializeGame(
      room.player1_id, room.player1_name,
      currentState.p1_deck,
      room.player2_id, room.player2_name,
      currentState.p2_deck
    );

    await query(
      `UPDATE game_rooms SET game_state=$2, status='playing', current_turn=$3, phase='main', last_action_at=NOW() WHERE code=$1`,
      [code.toUpperCase(), JSON.stringify(gameState), gameState.currentTurn]
    );

    return NextResponse.json({ started: true, firstPlayer: gameState.firstPlayer });
  }

  // Save partial state (waiting for other player's deck)
  await query(
    `UPDATE game_rooms SET game_state=$2, last_action_at=NOW() WHERE code=$1`,
    [code.toUpperCase(), JSON.stringify(currentState)]
  );

  return NextResponse.json({ waiting: true, message: "Deck submitted. Waiting for opponent." });
}
