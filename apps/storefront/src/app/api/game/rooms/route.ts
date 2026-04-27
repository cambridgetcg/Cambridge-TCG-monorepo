import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createRoom, joinRoom, listPublicRooms } from "@/lib/game/engine";

// GET — list public rooms
export async function GET() {
  const rooms = await listPublicRooms();
  return NextResponse.json({ rooms });
}

// POST — create or join room
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const body = await request.json();
  const name = session.user.name || session.user.email?.split("@")[0] || "Player";

  if (body.action === "create") {
    const room = await createRoom(session.user.id, name, body.isPublic || false);
    return NextResponse.json({ room });
  }

  if (body.action === "join") {
    if (!body.code) return NextResponse.json({ error: "Room code required." }, { status: 400 });
    const result = await joinRoom(body.code.toUpperCase(), session.user.id, name);
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ room: result });
  }

  return NextResponse.json({ error: "Invalid action." }, { status: 400 });
}
