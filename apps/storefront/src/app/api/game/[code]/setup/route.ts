import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoom, initializeGame } from "@/lib/game/engine";
import { dealOpeningHands } from "@/lib/game/engine-setup";
import { query } from "@/lib/db";
import { validateGameDeck } from "@/lib/game/request-input";
import { checkDeckLegality } from "@/lib/play/deck-legality";
import { loadCardMetadata, toCardNumber } from "@/lib/play/deck-metadata";

// POST — submit deck and start game
export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const session = await auth();
  if (!session?.user?.id)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { code } = await params;
  const room = await getRoom(code.toUpperCase());
  if (!room)
    return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const isP1 = room.player1_id === session.user.id;
  const isP2 = room.player2_id === session.user.id;
  if (!isP1 && !isP2)
    return NextResponse.json(
      { error: "You're not in this game." },
      { status: 403 },
    );

  const agentMatch = await query(
    `SELECT 1 FROM agent_matches WHERE game_room_id = $1 LIMIT 1`,
    [room.id],
  );
  if (agentMatch.rows.length > 0) {
    return NextResponse.json(
      { error: "Agent match writes are paused on every route." },
      { status: 409, headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = await request.json();

  // Store this player's deck in the game state
  const validatedDeck = validateGameDeck(body?.deck);
  if (!validatedDeck.ok) {
    return NextResponse.json({ error: validatedDeck.error }, { status: 400 });
  }
  const deck = validatedDeck.value;

  // Refereed rooms enforce CR 5-2-1-1: the deck presented at setup must
  // meet the construction rules — exactly 50 + a leader, 4-copy limit by
  // card number, banlist, and the color rule where metadata is known.
  // Tabletop rooms keep the honor-system 10+ card threshold.
  if (room.rules_mode === "referee") {
    const leader = deck.find((c) => c.isLeader);
    if (!leader) {
      return NextResponse.json(
        { error: "Refereed matches need a Leader card in the deck." },
        { status: 400 },
      );
    }
    const mainNumbers = deck
      .filter((c) => !c.isLeader)
      .map((c) => toCardNumber(c.cardNumber));
    const { lookup } = await loadCardMetadata(
      new Set([toCardNumber(leader.cardNumber), ...mainNumbers]),
    );
    const legality = checkDeckLegality(
      {
        leader_id: toCardNumber(leader.cardNumber),
        main_deck_card_ids: mainNumbers,
        format: "standard",
      },
      lookup,
    );
    if (!legality.legal) {
      return NextResponse.json(
        {
          error:
            "This deck doesn't meet the official construction rules — refereed tables require a legal deck. Violations attached; the deck-check page explains each.",
          violations: legality.violations,
        },
        { status: 400 },
      );
    }
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
    [code.toUpperCase(), stateKey, JSON.stringify(deck)],
  );
  const currentState = merged.rows[0].game_state;

  // Check if both players submitted decks
  if (currentState.p1_deck && currentState.p2_deck) {
    // Initialize the full game. Refereed rooms follow the official setup:
    // hands first, a mulligan window for BOTH humans, then life
    // (CR 5-2-1-6/7 via the referee's mulligan flow). Tabletop keeps the
    // historical one-shot deal.
    const gameState =
      room.rules_mode === "referee"
        ? dealOpeningHands(
            room.player1_id,
            room.player1_name,
            currentState.p1_deck,
            room.player2_id,
            room.player2_name,
            currentState.p2_deck,
            Math.random() < 0.5 ? room.player1_id : room.player2_id,
          )
        : initializeGame(
            room.player1_id,
            room.player1_name,
            currentState.p1_deck,
            room.player2_id,
            room.player2_name,
            currentState.p2_deck,
          );

    // Guard: only the first request to see both decks initializes — a
    // concurrent double-init would re-shuffle and erase the other's write.
    const init = await query(
      `UPDATE game_rooms SET game_state=$2, status='playing', current_turn=$3, phase=$4, last_action_at=NOW()
       WHERE code=$1 AND (game_state->'player1') IS NULL`,
      [
        code.toUpperCase(),
        JSON.stringify(gameState),
        gameState.currentTurn,
        gameState.phase,
      ],
    );
    if (init.rowCount === 0) {
      // The other player's request initialized first — fine.
      return NextResponse.json({ started: true });
    }

    return NextResponse.json({ started: true });
  }

  return NextResponse.json({
    waiting: true,
    message: "Deck submitted. Waiting for opponent.",
  });
}
