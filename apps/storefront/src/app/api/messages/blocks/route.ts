import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { blockUser, unblockUser, listBlocked } from "@/lib/messages/db";

// GET — my block list
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const blocks = await listBlocked(session.user.id);
  return NextResponse.json({ blocks });
}

// POST — block. Body: { userId }
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required." }, { status: 400 });
  const result = await blockUser(session.user.id, body.userId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true });
}

// DELETE — unblock. Body: { userId }
export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { userId?: string };
  if (!body.userId) return NextResponse.json({ error: "userId required." }, { status: 400 });
  const result = await unblockUser(session.user.id, body.userId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true });
}
