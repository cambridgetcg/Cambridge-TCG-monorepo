// Direct messaging lib.
//
// Generalises the dispute_messages pattern (migration 0019) so any
// two users can thread a conversation. Discriminated-union returns
// match offers/returns/saved-searches:
//   { ok: true, value } | { ok: false, reason, status }
//
// All conversations are canonicalised as ordered pairs
// (user_a_id < user_b_id) so one DB row covers both directions.
// The sortPair helper hides the ordering from callers.

import { query, transaction } from "@/lib/db";
import { notify } from "@/lib/notifications/db";
import { dispatchDmUnreadEmail } from "@/lib/email/handlers/dm-unread";

export interface DmConversation {
  id: string;
  user_a_id: string;
  user_b_id: string;
  last_message_at: string | null;
  last_sender_id: string | null;
  last_message_preview: string | null;
  message_count: number;
  last_read_at_a: string | null;
  last_read_at_b: string | null;
  archived_a: boolean;
  archived_b: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // Joined for inbox render — the OTHER party's profile fields.
  other_user_id?: string;
  other_username?: string | null;
  other_name?: string | null;
  other_avatar_url?: string | null;
  unread?: boolean;
}

export interface DmMessage {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: string;
}

type Result<T> = { ok: true; value: T } | { ok: false; reason: string; status: number };

// 10/min: a shipping-address exchange is several short lines in quick
// succession — the old 5/min tripped mid-exchange. 50/day still caps
// broadcast abuse. Documented at /methodology/messaging.
const RATE_LIMIT_PER_MINUTE = 10;
const RATE_LIMIT_PER_DAY = 50;
// New threads (distinct counterparties) opened per hour. Messaging ten
// strangers in an hour is already unusual; opening more is a spam shape.
const THREAD_OPENS_PER_HOUR = 10;
const MAX_BODY_LEN = 2000;

// ── Internal: canonicalise the user pair ──
//
// Returns [a, b] with a < b. Caller passes the two IDs in any order.
function sortPair(x: string, y: string): [string, string] {
  return x < y ? [x, y] : [y, x];
}

// ── Block check (bidirectional) ──
//
// Returns true if EITHER user has the other on their block list.
// Used as a pre-condition gate by sendMessage.
export async function isBlockedEither(a: string, b: string): Promise<boolean> {
  const r = await query(
    `SELECT 1 FROM user_blocks
      WHERE (blocker_id = $1 AND blocked_id = $2)
         OR (blocker_id = $2 AND blocked_id = $1)
      LIMIT 1`,
    [a, b],
  );
  return r.rows.length > 0;
}

// ── Shared pre-condition guard ──
//
// One gate for BOTH ways a conversation reaches another user's inbox:
// sending a message and opening an (empty) thread. Before this guard
// existed at thread-open, anyone could park empty threads in a blocked
// user's inbox via POST /api/messages/conversations.
export async function assertCanMessage(
  senderId: string, recipientId: string,
): Promise<Result<void>> {
  if (senderId === recipientId) {
    return { ok: false, reason: "You can't message yourself.", status: 400 };
  }

  const rcpt = await query(
    `SELECT id, accepts_messages FROM users WHERE id = $1`,
    [recipientId],
  );
  if (rcpt.rows.length === 0) {
    return { ok: false, reason: "Recipient not found.", status: 404 };
  }
  if (!rcpt.rows[0].accepts_messages) {
    return {
      ok: false,
      reason: "This user isn't accepting messages.",
      status: 403,
    };
  }

  if (await isBlockedEither(senderId, recipientId)) {
    return {
      ok: false,
      reason: "Cannot send — block list prevents this conversation.",
      status: 403,
    };
  }

  return { ok: true, value: undefined };
}

// ── Trade-context references (allowlist + relationship check) ──
//
// A message may carry a reference (rendered as a chip in the thread
// UI). The type is allowlisted and the SENDER's relationship to the
// referenced row is verified before anything is stored. This closes
// a phishing vector: without the check, a stranger could decorate
// "problem with your trade — pay again here" with a chip pointing at
// a real trade they are no party to, borrowing the platform's
// provenance for the lie.
//
// Per-type relationship: trades/offers require the sender to be a
// party; lots must exist and be live (anyone may enquire about an
// active listing); auctions are public pages (existence only);
// orders are anonymous on the tape, so only the owner may cite one.

export const REFERENCE_TYPES = [
  "market_trade", "market_lot", "offer", "auction", "market_order",
] as const;
export type ReferenceType = (typeof REFERENCE_TYPES)[number];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function validateReference(
  senderId: string, referenceType?: string, referenceId?: string,
): Promise<Result<void>> {
  if (!referenceType && !referenceId) return { ok: true, value: undefined };
  if (!referenceType || !referenceId) {
    return {
      ok: false,
      reason: "referenceType and referenceId must be provided together.",
      status: 400,
    };
  }
  if (!(REFERENCE_TYPES as readonly string[]).includes(referenceType)) {
    return { ok: false, reason: "Unknown referenceType.", status: 400 };
  }
  // All reference ids are UUID PKs — pre-check the shape so a garbage
  // id is a clean 400, not a pg uuid-cast 500.
  if (!UUID_RE.test(referenceId)) {
    return { ok: false, reason: "Invalid referenceId.", status: 400 };
  }

  let r;
  if (referenceType === "market_trade") {
    r = await query(
      `SELECT 1 FROM market_trades
        WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`,
      [referenceId, senderId],
    );
  } else if (referenceType === "market_lot") {
    r = await query(
      `SELECT 1 FROM market_lots WHERE id = $1 AND status = 'active'`,
      [referenceId],
    );
  } else if (referenceType === "offer") {
    r = await query(
      `SELECT 1 FROM market_offers
        WHERE id = $1 AND (buyer_id = $2 OR seller_id = $2)`,
      [referenceId, senderId],
    );
  } else if (referenceType === "auction") {
    r = await query(`SELECT 1 FROM auctions WHERE id = $1`, [referenceId]);
  } else {
    // market_order
    r = await query(
      `SELECT 1 FROM market_orders WHERE id = $1 AND user_id = $2`,
      [referenceId, senderId],
    );
  }
  if (r.rows.length === 0) {
    return {
      ok: false,
      reason: "Reference not found or not yours to cite.",
      status: 400,
    };
  }
  return { ok: true, value: undefined };
}

// ── sendMessage ──
//
// Idempotent in spirit but not in fact: each call creates a new
// message row. The (conversation, sender) tuple is the natural key
// for client-side dedup (don't fire the request twice).

export async function sendMessage(input: {
  senderId: string;
  recipientId: string;
  body: string;
  referenceType?: string;
  referenceId?: string;
}): Promise<Result<DmMessage>> {
  const body = input.body?.trim();
  if (!body || body.length === 0) {
    return { ok: false, reason: "Message body is empty.", status: 400 };
  }
  if (body.length > MAX_BODY_LEN) {
    return { ok: false, reason: `Message body must be ≤ ${MAX_BODY_LEN} chars.`, status: 400 };
  }

  // Rate limit (per-sender, simple time-window count)
  const recent = await query(
    `SELECT
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 minute')::int AS minute_count,
       COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours')::int AS day_count
       FROM dm_messages WHERE sender_id = $1`,
    [input.senderId],
  );
  if (recent.rows[0].minute_count >= RATE_LIMIT_PER_MINUTE) {
    return { ok: false, reason: "Too many messages — slow down.", status: 429 };
  }
  if (recent.rows[0].day_count >= RATE_LIMIT_PER_DAY) {
    return { ok: false, reason: `Daily message cap of ${RATE_LIMIT_PER_DAY} reached.`, status: 429 };
  }

  // Self / recipient-exists / accepts_messages / block gate — shared
  // with openConversation so both inbox-entry paths refuse identically.
  const guard = await assertCanMessage(input.senderId, input.recipientId);
  if (!guard.ok) return guard;

  // Trade-context reference (if any) — allowlist + sender-relationship
  // check before the chip is stored. See validateReference above.
  const ref = await validateReference(
    input.senderId, input.referenceType, input.referenceId,
  );
  if (!ref.ok) return ref;

  const [aId, bId] = sortPair(input.senderId, input.recipientId);

  // Conversation upsert + message insert + cache bump are one atomic
  // unit: a crash between them must not leave a message the inbox list
  // can't see (the list orders by the cached last_message_at).
  const { convId, msg } = await transaction(async (tx) => {
    // Find-or-create the conversation. INSERT ... ON CONFLICT (canonical
    // unique) so concurrent first-messages from both sides don't race.
    // created_by only lands on genuine creation — DO UPDATE leaves the
    // original opener in place.
    const convRow = await tx(
      `INSERT INTO dm_conversations (user_a_id, user_b_id, created_by)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET updated_at = NOW()
       RETURNING *`,
      [aId, bId, input.senderId],
    );
    const convId = convRow.rows[0].id as string;

    const msg = await tx(
      `INSERT INTO dm_messages
         (conversation_id, sender_id, body, reference_type, reference_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [convId, input.senderId, body,
       input.referenceType ?? null, input.referenceId ?? null],
    );

    // Bump the conversation cache. Un-archives for both parties (a
    // new message wakes the thread). Preview = first 120 chars of body.
    await tx(
      `UPDATE dm_conversations
          SET last_message_at = NOW(),
              last_sender_id = $2,
              last_message_preview = $3,
              message_count = message_count + 1,
              archived_a = false, archived_b = false,
              updated_at = NOW()
        WHERE id = $1`,
      [convId, input.senderId, body.slice(0, 120)],
    );

    return { convId, msg };
  });

  // Notify the recipient. Dedup keyed by (conversation, day) so a
  // burst of messages within one day collapses to one notification
  // — bell shows "@alice sent you a message" and the inbox shows
  // the full thread on click.
  const today = new Date().toISOString().slice(0, 10);
  const senderRow = await query(
    `SELECT username, name FROM users WHERE id = $1`,
    [input.senderId],
  );
  const sender = senderRow.rows[0];
  const senderLabel = sender?.username
    ? `@${sender.username}`
    : (sender?.name || "Someone");
  await notify({
    userId: input.recipientId,
    kind: "message.received",
    title: `${senderLabel} sent you a message`,
    body: body.slice(0, 160),
    linkUrl: `/account/messages?c=${convId}`,
    referenceType: "dm_conversation",
    referenceId: `${convId}:${today}`,
  });

  // Email the recipient (best-effort, own dedup window — see the
  // handler). Awaited because a detached promise dies with the
  // serverless invocation; caught because an email failure must not
  // fail the send.
  try {
    await dispatchDmUnreadEmail({
      conversationId: convId,
      recipientId: input.recipientId,
      senderId: input.senderId,
    });
  } catch (err) {
    console.error("[messages] dm email dispatch failed:", err);
  }

  return { ok: true, value: msg.rows[0] as DmMessage };
}

// ── Inbox queries ──

export async function listConversations(userId: string): Promise<DmConversation[]> {
  // Self-join users twice to resolve the OTHER party's profile. The
  // OR-WHERE matches both sides of the canonical pair; the CASE
  // picks the non-self side. archived_<role> hides per-user.
  //
  // Zero-message threads show only to their creator (they opened it and
  // may still be composing); the other party sees the thread when the
  // first message lands. Pre-0110 rows have created_by NULL, so stale
  // empty threads disappear from both inboxes.
  const r = await query(
    `SELECT c.*,
            CASE WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END AS other_user_id,
            ou.username AS other_username,
            ou.name AS other_name,
            ou.avatar_url AS other_avatar_url,
            CASE
              WHEN c.user_a_id = $1 THEN
                (c.last_message_at IS NOT NULL
                 AND (c.last_read_at_a IS NULL OR c.last_message_at > c.last_read_at_a)
                 AND c.last_sender_id != $1)
              ELSE
                (c.last_message_at IS NOT NULL
                 AND (c.last_read_at_b IS NULL OR c.last_message_at > c.last_read_at_b)
                 AND c.last_sender_id != $1)
            END AS unread
       FROM dm_conversations c
       JOIN users ou ON ou.id = CASE
            WHEN c.user_a_id = $1 THEN c.user_b_id ELSE c.user_a_id END
      WHERE ((c.user_a_id = $1 AND NOT c.archived_a)
         OR (c.user_b_id = $1 AND NOT c.archived_b))
        AND (c.message_count > 0 OR c.created_by = $1)
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 100`,
    [userId],
  );
  return r.rows as DmConversation[];
}

// ── Conversation render ──

export interface ConversationView {
  conversation: DmConversation;
  /** Ascending (oldest → newest) — but always the NEWEST page. */
  messages: DmMessage[];
  /** True when messages older than the returned page exist. */
  hasEarlier: boolean;
}

export async function getConversation(
  conversationId: string, userId: string,
  options: { limit?: number; before?: string } = {},
): Promise<Result<ConversationView>> {
  const r = await query(
    `SELECT c.*,
            CASE WHEN c.user_a_id = $2 THEN c.user_b_id ELSE c.user_a_id END AS other_user_id,
            ou.username AS other_username,
            ou.name AS other_name,
            ou.avatar_url AS other_avatar_url
       FROM dm_conversations c
       JOIN users ou ON ou.id = CASE
            WHEN c.user_a_id = $2 THEN c.user_b_id ELSE c.user_a_id END
      WHERE c.id = $1`,
    [conversationId, userId],
  );
  if (r.rows.length === 0) {
    return { ok: false, reason: "Conversation not found.", status: 404 };
  }
  const conv = r.rows[0] as DmConversation;
  if (conv.user_a_id !== userId && conv.user_b_id !== userId) {
    return { ok: false, reason: "Not your conversation.", status: 403 };
  }

  // Read the NEWEST page (a busy thread must never hide its latest
  // replies), then reverse to ascending for the renderer. `before`
  // pages backwards through history — "load earlier". limit+1 probes
  // whether an earlier page exists without a second COUNT query.
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 500);
  let before: string | null = null;
  if (options.before !== undefined) {
    const parsed = new Date(options.before);
    if (Number.isNaN(parsed.getTime())) {
      return { ok: false, reason: "Invalid 'before' cursor.", status: 400 };
    }
    before = parsed.toISOString();
  }
  const m = await query(
    `SELECT * FROM dm_messages
      WHERE conversation_id = $1
        AND ($3::timestamptz IS NULL OR created_at < $3)
      ORDER BY created_at DESC LIMIT $2`,
    [conversationId, limit + 1, before],
  );
  const hasEarlier = m.rows.length > limit;
  const page = (m.rows as DmMessage[]).slice(0, limit).reverse();

  return { ok: true, value: { conversation: conv, messages: page, hasEarlier } };
}

// ── Mark conversation read ──
//
// Advances the per-user read cursor to NOW(). Idempotent — re-marking
// a conversation that's already current is a no-op COALESCE pattern.

export async function markConversationRead(
  conversationId: string, userId: string,
): Promise<Result<void>> {
  const r = await query(
    `UPDATE dm_conversations
        SET last_read_at_a = CASE WHEN user_a_id = $2 THEN NOW() ELSE last_read_at_a END,
            last_read_at_b = CASE WHEN user_b_id = $2 THEN NOW() ELSE last_read_at_b END,
            updated_at = NOW()
      WHERE id = $1 AND ($2 IN (user_a_id, user_b_id))
      RETURNING id`,
    [conversationId, userId],
  );
  if (r.rows.length === 0) {
    return { ok: false, reason: "Not your conversation.", status: 403 };
  }
  return { ok: true, value: undefined };
}

// ── Archive / unarchive (per-user) ──

export async function setConversationArchived(
  conversationId: string, userId: string, archived: boolean,
): Promise<Result<void>> {
  const r = await query(
    `UPDATE dm_conversations
        SET archived_a = CASE WHEN user_a_id = $2 THEN $3 ELSE archived_a END,
            archived_b = CASE WHEN user_b_id = $2 THEN $3 ELSE archived_b END,
            updated_at = NOW()
      WHERE id = $1 AND ($2 IN (user_a_id, user_b_id))
      RETURNING id`,
    [conversationId, userId, archived],
  );
  if (r.rows.length === 0) {
    return { ok: false, reason: "Not your conversation.", status: 403 };
  }
  return { ok: true, value: undefined };
}

// ── Block list ──

export async function blockUser(
  blockerId: string, blockedId: string,
): Promise<Result<void>> {
  if (blockerId === blockedId) {
    return { ok: false, reason: "You can't block yourself.", status: 400 };
  }
  await query(
    `INSERT INTO user_blocks (blocker_id, blocked_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [blockerId, blockedId],
  );
  return { ok: true, value: undefined };
}

export async function unblockUser(
  blockerId: string, blockedId: string,
): Promise<Result<void>> {
  await query(
    `DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2`,
    [blockerId, blockedId],
  );
  return { ok: true, value: undefined };
}

export async function listBlocked(userId: string): Promise<Array<{
  blocked_id: string; username: string | null; name: string | null; created_at: string;
}>> {
  const r = await query(
    `SELECT b.blocked_id, u.username, u.name, b.created_at
       FROM user_blocks b JOIN users u ON u.id = b.blocked_id
      WHERE b.blocker_id = $1
      ORDER BY b.created_at DESC`,
    [userId],
  );
  return r.rows;
}

// ── Counts (for the bell badge / sidebar count) ──

export async function unreadConversationCount(userId: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM dm_conversations c
      WHERE c.last_message_at IS NOT NULL
        AND c.last_sender_id != $1
        AND (
          (c.user_a_id = $1 AND NOT c.archived_a
            AND (c.last_read_at_a IS NULL OR c.last_message_at > c.last_read_at_a))
          OR
          (c.user_b_id = $1 AND NOT c.archived_b
            AND (c.last_read_at_b IS NULL OR c.last_message_at > c.last_read_at_b))
        )`,
    [userId],
  );
  return r.rows[0].n;
}

// ── Find-or-open by other-user pair (for "Message" button on profile) ──
//
// Runs the same assertCanMessage gate as sendMessage, so a blocked or
// opted-out recipient is refused BEFORE the initiator composes anything
// — the honest error surfaces at the button, not after typing. Opening
// an already-existing thread is never rate-limited; only genuine
// creation counts against THREAD_OPENS_PER_HOUR.

export async function openConversation(
  initiatorId: string, otherUserId: string,
): Promise<Result<DmConversation>> {
  const guard = await assertCanMessage(initiatorId, otherUserId);
  if (!guard.ok) return guard;

  const [a, b] = sortPair(initiatorId, otherUserId);
  const existing = await query(
    `SELECT * FROM dm_conversations WHERE user_a_id = $1 AND user_b_id = $2`,
    [a, b],
  );
  if (existing.rows.length > 0) {
    return { ok: true, value: existing.rows[0] as DmConversation };
  }

  const opens = await query(
    `SELECT COUNT(*)::int AS n FROM dm_conversations
      WHERE created_by = $1 AND created_at > NOW() - INTERVAL '1 hour'`,
    [initiatorId],
  );
  if (opens.rows[0].n >= THREAD_OPENS_PER_HOUR) {
    return {
      ok: false,
      reason: `You can open at most ${THREAD_OPENS_PER_HOUR} new conversations per hour.`,
      status: 429,
    };
  }

  // ON CONFLICT covers the race with a concurrent first-message from
  // either side; DO UPDATE only touches updated_at so the racer's
  // created_by wins and stays.
  const r = await query(
    `INSERT INTO dm_conversations (user_a_id, user_b_id, created_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [a, b, initiatorId],
  );
  return { ok: true, value: r.rows[0] as DmConversation };
}
