import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { performAction } from "@/lib/game/engine";

// POST — perform a game action
export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  const { code } = await params;
  const body = await request.json();

  const result = await performAction(code.toUpperCase(), session.user.id, {
    type: body.type,
    playerId: session.user.id,
    data: body.data || {},
    timestamp: new Date().toISOString(),
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json(result);
}
