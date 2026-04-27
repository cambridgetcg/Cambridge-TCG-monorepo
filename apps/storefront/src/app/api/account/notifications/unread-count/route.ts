import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { unreadCount } from "@/lib/notifications/db";

// GET — how many unread notifications the signed-in user has.
// Powers the nav bell badge; called frequently, so it's a partial-
// index COUNT which runs in ~microseconds.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ count: 0 });
  }
  const count = await unreadCount(session.user.id);
  return NextResponse.json({ count });
}
