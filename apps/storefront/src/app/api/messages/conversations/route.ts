import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  listConversations,
  unreadConversationCount,
  openConversation,
  resolveReferenceRecipient,
  validateReference,
} from "@/lib/messages/db";
import { query } from "@/lib/db";
import { PERSON_PUBLICATION_NOTICE_VERSION } from "@/lib/social/publication";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

// GET — inbox. Returns list + unreadCount in one round trip so the
// page header and rows are consistent.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const [conversations, unreadCount] = await Promise.all([
    listConversations(session.user.id),
    unreadConversationCount(session.user.id),
  ]);
  return NextResponse.json({ conversations, unreadCount }, { headers: PRIVATE_HEADERS });
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
  let otherUserId: string | undefined;
  if (!otherUserId && body.otherUsername?.trim()) {
    const target = await query(
      `SELECT u.id
         FROM users u
         LEFT JOIN trust_profiles tp ON tp.user_id=u.id
        WHERE LOWER(u.username)=$1
          AND u.is_public=TRUE
          AND u.profile_publication_notice_version=$2
          AND u.profile_published_at IS NOT NULL
          AND COALESCE(tp.is_suspended,FALSE)=FALSE
        LIMIT 1`,
      [body.otherUsername.trim().toLowerCase(), PERSON_PUBLICATION_NOTICE_VERSION],
    );
    otherUserId = target.rows[0]?.id as string | undefined;
  }
  if (!otherUserId && body.referenceType && body.referenceId) {
    const resolved = await resolveReferenceRecipient(
      session.user.id,
      body.referenceType,
      body.referenceId,
    );
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.reason }, { status: resolved.status });
    }
    otherUserId = resolved.value;
  }
  if (!otherUserId && body.otherUserId) {
    // A bare id can only reopen an existing authorised conversation. The
    // library gate below refuses it for new contact.
    otherUserId = body.otherUserId;
  }
  if (!otherUserId) {
    return NextResponse.json({ error: "Public recipient not found." }, { status: 404 });
  }
  const ref = await validateReference(session.user.id, body.referenceType, body.referenceId, otherUserId);
  if (!ref.ok) {
    return NextResponse.json({ error: ref.reason }, { status: ref.status });
  }
  const result = await openConversation(session.user.id, otherUserId, {
    hasValidatedContext: Boolean(body.referenceType && body.referenceId),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: result.status });
  }
  return NextResponse.json(
    { conversation: result.value },
    { headers: PRIVATE_HEADERS },
  );
}
