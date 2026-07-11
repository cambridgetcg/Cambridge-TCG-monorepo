import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { performAction, getRoom } from "@/lib/game/engine";
import type { GameState } from "@/lib/game/types";

// Upkeep actions the client may NOT send individually — they run as the
// composite `begin_turn` action (once per turn, enforced by the reducer's
// lastUpkeepTurn stamp). Same guard set as the PVE route.
const UPKEEP_ONLY_VIA_BEGIN_TURN = new Set(["refresh_all", "draw_card", "add_don"]);

// Actions legal on either player's turn: concede/chat always, and
// take_damage because the defender reveals life during the attacker's turn.
const TURN_EXEMPT = new Set(["concede", "chat", "take_damage"]);

// POST — perform a game action
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { code } = await params;
  const body = await request.json();

  if (typeof body.type !== "string") {
    return NextResponse.json({ error: "Invalid action type." }, { status: 400 });
  }
  if (UPKEEP_ONLY_VIA_BEGIN_TURN.has(body.type)) {
    return NextResponse.json(
      { error: "Upkeep runs automatically at the start of your turn." },
      { status: 409 },
    );
  }

  const roomCode = code.toUpperCase();

  // Reject moves sent on the opponent's turn (cheap anti-cheat, mirrors PVE).
  if (!TURN_EXEMPT.has(body.type)) {
    const room = await getRoom(roomCode);
    const state: GameState | undefined = room?.game_state;
    if (state?.currentTurn && state.currentTurn !== session.user.id) {
      return NextResponse.json({ error: "Not your turn." }, { status: 409 });
    }
  }

  const result = await performAction(roomCode, session.user.id, {
    type: body.type,
    playerId: session.user.id,
    data: body.data || {},
    timestamp: new Date().toISOString(),
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  // The client polls the viewer-specific state route after every action.
  // Never mirror the engine's internal state here: it contains both account
  // ids and both players' hidden zones.
  return NextResponse.json({ ok: true });
}
