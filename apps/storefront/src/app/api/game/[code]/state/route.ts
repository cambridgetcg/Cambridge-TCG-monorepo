import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getRoom } from "@/lib/game/engine";
import {
  canViewGameRoom,
  gameViewer,
  projectGameResponse,
  type GameRoomForProjection,
} from "@/lib/game/public";

// GET — poll game state (called every 1-2 seconds)
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  const { code } = await params;

  const room = await getRoom(code.toUpperCase());
  if (!room) return NextResponse.json({ error: "Room not found." }, { status: 404 });

  const projectionRoom = room as GameRoomForProjection;
  const viewer = gameViewer(projectionRoom, session?.user?.id);
  if (!canViewGameRoom(projectionRoom, viewer)) {
    return NextResponse.json({ error: "Room not found." }, { status: 404 });
  }

  return NextResponse.json(projectGameResponse(projectionRoom, viewer), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
