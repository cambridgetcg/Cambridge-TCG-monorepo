import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications/db";

// GET /api/account/notifications
//   ?unread=1          — only unread
//   ?limit=30          — page size (max 100)
//   ?offset=0          — pagination offset
//
// Returns the signed-in user's notifications ordered by created_at desc.
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const url = new URL(request.url);
  const unreadOnly = url.searchParams.get("unread") === "1" || url.searchParams.get("unread") === "true";
  const limit = parseInt(url.searchParams.get("limit") ?? "30", 10) || 30;
  const offset = parseInt(url.searchParams.get("offset") ?? "0", 10) || 0;

  const notifications = await listNotifications(session.user.id, { unreadOnly, limit, offset });
  return NextResponse.json({ notifications });
}
