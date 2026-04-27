import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoom } from "@/lib/game/engine";

// GET — poll game state (called every 1-2 seconds)
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  const { code } = await params;

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const userId = session?.user?.id;
  const isP1 = room.player1_id === userId;
  const isP2 = room.player2_id === userId;
  const isPlayer = isP1 || isP2;

  // Hide opponent's hand and deck from player
  const state = room.game_state;
  if (state && isPlayer) {
    const opponentKey = isP1 ? "player2" : "player1";
    const opp = state[opponentKey];
    if (opp) {
      // Hide hand cards (show count only)
      opp.hand = opp.hand?.map((c: Record<string, unknown>) => ({ ...c, sku: "", name: "?", cardNumber: "?", imageUrl: null, faceDown: true })) || [];
      // Hide deck
      opp.deck = opp.deck?.map((c: Record<string, unknown>) => ({ ...c, sku: "", name: "?", cardNumber: "?", imageUrl: null, faceDown: true })) || [];
      // Hide face-down life
      opp.life = opp.life?.map((c: Record<string, unknown>) => ({ ...c, sku: "", name: "?", cardNumber: "?", imageUrl: null, faceDown: true })) || [];
    }
  }

  return NextResponse.json({
    room: {
      id: room.id,
      code: room.code,
      status: room.status,
      player1Name: room.player1_name,
      player2Name: room.player2_name,
      player1Id: room.player1_id,
      player2Id: room.player2_id,
      turnNumber: room.turn_number,
      phase: room.phase,
      isPublic: room.is_public,
      lastActionAt: room.last_action_at,
    },
    state,
    log: (room.game_log || []).slice(-20), // Last 20 actions
    you: isP1 ? "player1" : isP2 ? "player2" : "spectator",
  });
}
