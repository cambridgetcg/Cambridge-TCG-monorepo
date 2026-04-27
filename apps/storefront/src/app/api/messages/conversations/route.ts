import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConversations,
  unreadConversationCount,
  findOrCreateConversation,
} from "@/lib/messages/db";

// GET — inbox. Returns list + unreadCount in one round trip so the
// page header and rows are consistent.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [conversations, unreadCount] = await Promise.all([
    listConversations(session.user.id),
    unreadConversationCount(session.user.id),
  ]);
  return NextResponse.json({ conversations, unreadCount });
}

// POST — open a thread with a specific user (no message yet). Used
// by the "Message" button on /u/[username] so the inbox shows the
// thread immediately and the user can compose from there.
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { otherUserId?: string };
  if (!body.otherUserId) {
    return NextResponse.json({ error: "otherUserId required." }, { status: 400 });
  }
  if (body.otherUserId === session.user.id) {
    return NextResponse.json({ error: "Can't open a thread with yourself." }, { status: 400 });
  }
  try {
    const conversation = await findOrCreateConversation(session.user.id, body.otherUserId);
    return NextResponse.json({ conversation });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 400 },
    );
  }
}
