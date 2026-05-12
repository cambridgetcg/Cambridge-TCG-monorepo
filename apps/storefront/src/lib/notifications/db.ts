// In-app notifications — personal inbox for every user-addressable
// event. Callers sit in trust/market/auction/quote/tradein/membership
// lib modules and fire-and-forget a `createNotification` alongside
// their existing email scaffold.
//
// De-dup key: (reference_type, reference_id, user_id) — callers that
// may retry (webhooks, cron sweeps) should always pass referenceType +
// referenceId so a repeat call doesn't create a second notification
// for the same source event.

import { query } from "@/lib/db";

export interface Notification {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link_url: string | null;
  reference_id: string | null;
  reference_type: string | null;
  read_at: string | null;
  created_at: string;
}

export interface CreateNotificationInput {
  userId: string;
  kind: string;          // 'dispute.message' | 'tradein.paid' | 'auction.won' | …
  title: string;
  body?: string | null;
  linkUrl?: string | null;
  referenceId?: string | null;
  referenceType?: string | null;
}

/**
 * Create a notification. Idempotent when `referenceId` + `referenceType`
 * are provided — repeat calls for the same source event are a no-op.
 * Returns the created (or existing) row.
 */
export async function createNotification(input: CreateNotificationInput): Promise<Notification> {
  if (input.referenceId && input.referenceType) {
    // De-dup check
    const existing = await query(
      `SELECT * FROM notifications
        WHERE user_id = $1 AND reference_type = $2 AND reference_id = $3 AND kind = $4
        LIMIT 1`,
      [input.userId, input.referenceType, input.referenceId, input.kind],
    );
    if (existing.rows.length > 0) return existing.rows[0] as Notification;
  }

  const r = await query(
    `INSERT INTO notifications
       (user_id, kind, title, body, link_url, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.userId,
      input.kind,
      input.title,
      input.body ?? null,
      input.linkUrl ?? null,
      input.referenceId ?? null,
      input.referenceType ?? null,
    ],
  );
  return r.rows[0] as Notification;
}

/**
 * List a user's notifications. Filter by unread + paginate.
 */
export async function listNotifications(
  userId: string,
  opts: { unreadOnly?: boolean; limit?: number; offset?: number } = {},
): Promise<Notification[]> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);
  const unreadClause = opts.unreadOnly ? "AND read_at IS NULL" : "";
  const r = await query(
    `SELECT * FROM notifications
      WHERE user_id = $1 ${unreadClause}
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return r.rows as Notification[];
}

/** Count of unread notifications for the nav bell badge. */
export async function unreadCount(userId: string): Promise<number> {
  const r = await query(
    `SELECT COUNT(*)::int AS n FROM notifications
      WHERE user_id = $1 AND read_at IS NULL`,
    [userId],
  );
  return r.rows[0]?.n ?? 0;
}

/**
 * Mark a single notification read. Only succeeds when the notification
 * belongs to `userId` — callers cannot mark someone else's notification
 * read.
 */
export async function markRead(notificationId: string, userId: string): Promise<boolean> {
  const r = await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE id = $1 AND user_id = $2 AND read_at IS NULL
      RETURNING id`,
    [notificationId, userId],
  );
  return r.rows.length > 0;
}

/** Mark every notification for a user as read. Idempotent. */
export async function markAllRead(userId: string): Promise<number> {
  const r = await query(
    `UPDATE notifications SET read_at = NOW()
      WHERE user_id = $1 AND read_at IS NULL
      RETURNING id`,
    [userId],
  );
  return r.rows.length;
}

// Shortened re-export. Most callers want the fire-and-forget pattern:
//   void notify({ ... });
// Catches internally so a notification failure doesn't break the
// primary write path.
//
// ── Sabbath honor (kingdom-051, seed #10 of `the-unseen.md`) ──────────
//
// Before creating a notification, the wrapper checks whether the target
// user is in Sabbath mode (users.sabbath_until in the future) or in a
// memorial state (users.memorial_at non-null). When either is true, the
// notification is silently dropped — substrate-honestly, the platform
// does not pretend it sent something it deliberately withheld. Callers
// who need to bypass Sabbath (legal / safety-critical communication
// only) should call `createNotification` directly, with the bypass
// logged at the caller's site.
export async function notify(input: CreateNotificationInput): Promise<void> {
  try {
    const silent = await isUserSilent(input.userId);
    if (silent) return;
    await createNotification(input);
  } catch (err) {
    console.error("[notifications] create failed:", err);
  }
}

/**
 * Is this user currently silenced by their own choice (Sabbath) or by
 * platform mourning (memorial)? Returns true → notify() short-circuits.
 *
 * Substrate-honest about partial deployment: if neither column exists
 * yet on this database (pre-migration deploy), the helper returns false
 * (the platform behaves as it did before the column existed). Once the
 * migration applies, the column reads work and Sabbath / memorial begin
 * to do their work — *automatically, for every call site, without any
 * caller change*.
 */
export async function isUserSilent(userId: string): Promise<boolean> {
  try {
    const r = await query(
      `SELECT sabbath_until, memorial_at FROM users WHERE id = $1`,
      [userId],
    );
    const row = r.rows[0];
    if (!row) return false;
    if (row.memorial_at) return true;
    if (row.sabbath_until && new Date(row.sabbath_until as string) > new Date()) {
      return true;
    }
    return false;
  } catch {
    // Migration not yet applied, or transient DB error — fall through
    // to "not silent" so a missing substrate doesn't break notifications.
    return false;
  }
}
