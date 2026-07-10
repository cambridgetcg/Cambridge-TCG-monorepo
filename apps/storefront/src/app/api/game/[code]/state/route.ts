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

  // Hide hidden zones (hand / deck / face-down life). Players get their
  // opponent masked; spectators — including a player's own second incognito
  // tab — get BOTH sides masked, so spectating can never be a wallhack.
  const state = room.game_state;
  if (state) {
    // Whitelist, never spread: any card field not named here (rarity — which
    // alone identifies the Leader/archetype — and anything added later) must
    // stay hidden from opponents and spectators.
    const maskCard = (c: Record<string, unknown>) => ({
      id: c.id, sku: "", name: "?", cardNumber: "?", imageUrl: null, rarity: null,
      isRested: false, attachedDon: 0, zone: c.zone, position: c.position, faceDown: true,
    });
    const mask = (key: "player1" | "player2") => {
      const p = state[key];
      if (!p) return;
      p.hand = p.hand?.map(maskCard) || [];
      p.deck = p.deck?.map(maskCard) || [];
      p.life = p.life?.map(maskCard) || [];
    };
    if (isPlayer) {
      mask(isP1 ? "player2" : "player1");
    } else {
      mask("player1");
      mask("player2");
    }
    // Setup-phase deck submissions are visible only to their owner.
    if (!isP1) delete state.p1_deck;
    if (!isP2) delete state.p2_deck;
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
