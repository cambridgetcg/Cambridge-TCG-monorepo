import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { setConversationArchived } from "@/lib/messages/db";

// POST → archive (per-user)
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await setConversationArchived(id, session.user.id, true);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true });
}

// DELETE → unarchive (alias for "restore from archive")
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { id } = await params;
  const result = await setConversationArchived(id, session.user.id, false);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });
  return NextResponse.json({ ok: true });
}
