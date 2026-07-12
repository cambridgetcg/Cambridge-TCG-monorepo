import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConversations,
  unreadConversationCount,
  openConversation,
  validateReference,
} from "@/lib/messages/db";
import { query } from "@/lib/db";

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
    otherUsername?: string;
    referenceType?: string;
    referenceId?: string;
  };
  if (body.otherUserId && body.otherUsername?.trim()) {
    return NextResponse.json(
      { error: "Choose either otherUserId or otherUsername, not both." },
      { status: 400 },
    );
  }
  if (
    body.otherUserId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.otherUserId)
  ) {
    return NextResponse.json({ error: "Invalid recipient." }, { status: 400 });
  }
  let otherUserId = body.otherUserId;
  if (!otherUserId && body.otherUsername?.trim()) {
    const target = await query(
      `SELECT u.id
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id=u.id
        WHERE LOWER(u.username)=$1
          AND u.is_public=TRUE
          AND COALESCE(tp.is_suspended,FALSE)=FALSE
        LIMIT 1`,
      [body.otherUsername.trim().toLowerCase()],
    );
    otherUserId = target.rows[0]?.id as string | undefined;
  }
  // A listing-scoped Message button does not need to expose the seller's
  // account UUID to the browser. Resolve that counterparty at the trusted
  // boundary, then run the same relationship and recipient guards below.
  if (
    !otherUserId &&
    body.referenceType === "market_order" &&
    body.referenceId &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.referenceId)
  ) {
    const target = await query(
      `SELECT user_id
         FROM market_orders
        WHERE id=$1 AND status IN ('open', 'partially_filled')
        LIMIT 1`,
      [body.referenceId],
    );
    otherUserId = target.rows[0]?.user_id as string | undefined;
  }
  if (!otherUserId) {
    return NextResponse.json({ error: "Public recipient not found." }, { status: 404 });
  }
  if (body.otherUserId && !body.referenceType && !body.referenceId) {
    const publicTarget = await query(
      `SELECT 1
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id=u.id
        WHERE u.id=$1
          AND u.is_public=TRUE
          AND COALESCE(tp.is_suspended,FALSE)=FALSE`,
      [otherUserId],
    );
    if (publicTarget.rows.length === 0) {
      return NextResponse.json({ error: "Public recipient not found." }, { status: 404 });
    }
  }
  const ref = await validateReference(session.user.id, body.referenceType, body.referenceId, otherUserId);
  if (!ref.ok) {
    return NextResponse.json({ error: ref.reason }, { status: ref.status });
  }
  const result = await openConversation(session.user.id, otherUserId);
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json({ conversation: result.value });
}
