import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markRead } from "@/lib/notifications/db";

// POST — mark a single notification as read. Scoped to the caller's
// own notifications; attempts on another user's id return 404.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { id } = await params;
  const ok = await markRead(id, session.user.id);
  if (!ok) {
    return NextResponse.json({ error: "Not found or already read." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
