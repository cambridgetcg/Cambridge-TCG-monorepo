import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConversations,
  unreadConversationCount,
  openConversation,
  validateReference,
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
// by <MessageButton> (lib/ui) on profile and trade surfaces so the
// inbox shows the thread immediately and the user can compose from
// there. openConversation runs the same block / accepts_messages /
// exists gate as sendMessage plus a thread-creation rate limit, so a
// blocked recipient's inbox can't be reached even with empty threads —
// and the initiator learns BEFORE composing. Optional { referenceType,
// referenceId } is validated here so a forged reference never reaches
// the ?ref= deep-link (the send path re-validates before the chip is
// stored).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as {
    otherUserId?: string;
    referenceType?: string;
    referenceId?: string;
  };
  if (!body.otherUserId) {
    return NextResponse.json({ error: "otherUserId required." }, { status: 400 });
  }
  const ref = await validateReference(session.user.id, body.referenceType, body.referenceId, body.otherUserId);
  if (!ref.ok) {
    return NextResponse.json({ error: ref.reason }, { status: ref.status });
  }
  const result = await openConversation(session.user.id, body.otherUserId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ conversation: result.value });
}
