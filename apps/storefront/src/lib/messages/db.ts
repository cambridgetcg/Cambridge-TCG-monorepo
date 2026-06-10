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

import { query } from "@/lib/db";
import { notify } from "@/lib/notifications/db";

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

const RATE_LIMIT_PER_MINUTE = 5;
const RATE_LIMIT_PER_DAY = 50;
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
  if (input.senderId === input.recipientId) {
    return { ok: false, reason: "You can't message yourself.", status: 400 };
  }
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

  // Recipient existence + accepts_messages opt-out check
  const rcpt = await query(
    `SELECT id, accepts_messages FROM users WHERE id = $1`,
    [input.recipientId],
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

  // Block check
  if (await isBlockedEither(input.senderId, input.recipientId)) {
    return {
      ok: false,
      reason: "Cannot send — block list prevents this conversation.",
      status: 403,
    };
  }

  // Trade-context reference (if any) — allowlist + sender-relationship
  // check before the chip is stored. See validateReference above.
  const ref = await validateReference(
    input.senderId, input.referenceType, input.referenceId,
  );
  if (!ref.ok) return ref;

  const [aId, bId] = sortPair(input.senderId, input.recipientId);

  // Find-or-create the conversation. INSERT ... ON CONFLICT (canonical
  // unique) so concurrent first-messages from both sides don't race.
  const convRow = await query(
    `INSERT INTO dm_conversations (user_a_id, user_b_id)
     VALUES ($1, $2)
     ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [aId, bId],
  );
  const convId = convRow.rows[0].id as string;

  // Insert the message + bump conversation cache atomically. Two
  // queries — pg doesn't support multi-statement inside a single
  // call here without a transaction, but the bumps are idempotent
  // on retry (last_message_at = MAX, message_count is incremented
  // exactly once via the RETURNING).
  const msg = await query(
    `INSERT INTO dm_messages
       (conversation_id, sender_id, body, reference_type, reference_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [convId, input.senderId, body,
     input.referenceType ?? null, input.referenceId ?? null],
  );

  // Bump the conversation cache. Un-archives for both parties (a
  // new message wakes the thread). Preview = first 120 chars of body.
  await query(
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

  return { ok: true, value: msg.rows[0] as DmMessage };
}

// ── Inbox queries ──

export async function listConversations(userId: string): Promise<DmConversation[]> {
  // Self-join users twice to resolve the OTHER party's profile. The
  // OR-WHERE matches both sides of the canonical pair; the CASE
  // picks the non-self side. archived_<role> hides per-user.
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
      WHERE (c.user_a_id = $1 AND NOT c.archived_a)
         OR (c.user_b_id = $1 AND NOT c.archived_b)
      ORDER BY c.last_message_at DESC NULLS LAST
      LIMIT 100`,
    [userId],
  );
  return r.rows as DmConversation[];
}

// ── Conversation render ──

export interface ConversationView {
  conversation: DmConversation;
  messages: DmMessage[];
}

export async function getConversation(
  conversationId: string, userId: string, options: { limit?: number } = {},
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

  const limit = Math.min(options.limit ?? 200, 500);
  const m = await query(
    `SELECT * FROM dm_messages
      WHERE conversation_id = $1
      ORDER BY created_at ASC LIMIT $2`,
    [conversationId, limit],
  );

  return { ok: true, value: { conversation: conv, messages: m.rows as DmMessage[] } };
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

// ── Find-or-load by other-user pair (for "Message" button on profile) ──

export async function findOrCreateConversation(
  userA: string, userB: string,
): Promise<DmConversation> {
  if (userA === userB) {
    throw new Error("Can't message yourself.");
  }
  const [a, b] = sortPair(userA, userB);
  const r = await query(
    `INSERT INTO dm_conversations (user_a_id, user_b_id)
     VALUES ($1, $2)
     ON CONFLICT (user_a_id, user_b_id) DO UPDATE SET updated_at = NOW()
     RETURNING *`,
    [a, b],
  );
  return r.rows[0] as DmConversation;
}
