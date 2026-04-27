import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { markAllRead } from "@/lib/notifications/db";

// POST — mark every unread notification for the caller as read.
// Returns the number of rows affected so the UI can show a toast.
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const marked = await markAllRead(session.user.id);
  return NextResponse.json({ ok: true, marked });
}
