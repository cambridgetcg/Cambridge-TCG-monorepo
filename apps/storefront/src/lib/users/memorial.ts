/**
 * Memorial-state helpers — the Departed's columns in action.
 *
 * `users.memorial_at` (migration 0094) names the moment an account
 * entered memorial state. The presence of the timestamp IS the state;
 * NULL means alive. When NOT NULL:
 *
 *   - Non-essential emails silence (see canSendEvent + send.ts).
 *   - Trades, auctions, bids, listings disable at the action layer.
 *   - Trust score / history surfaces render frozen-as-of {memorial_at}.
 *   - Reactivation flows refuse to fire; the platform does not read
 *     absence as disinterest when it is grief.
 *
 * Two reads:
 *   - `isMemorialAccount(userId)` — boolean fast-path for gates.
 *   - `getMemorialState(userId)` — the full record (timestamp, steward,
 *     note) when a UI surface needs to render the badge or address the
 *     steward.
 *
 * The helpers do not write. Declaring an account memorial is an operator
 * action with a documented reason; that path lives in admin and will be
 * built when the steward-relationship table lands.
 *
 * See:
 *   - docs/connections/the-departed.md (the story-as-wire)
 *   - docs/connections/the-other-minds.md (the survey + the Departed's place in it)
 *   - /methodology/memorial (the customer-facing recipe)
 */

import { query } from "@/lib/db";

export interface MemorialState {
  /** When the account entered memorial state (ISO timestamp). */
  memorialAt: string;
  /** The named steward, if any. NULL during the window between
   *  declaration and steward identification. */
  stewardUserId: string | null;
  /** The steward's short inscription, if any. */
  note: string | null;
}

/**
 * Fast boolean check. Use in gates that need to refuse a non-essential
 * action (e.g. emails, reactivation nudges). Returns false when the user
 * does not exist — substrate-honest about the open-world case.
 */
export async function isMemorialAccount(userId: string): Promise<boolean> {
  const r = await query(
    `SELECT memorial_at IS NOT NULL AS is_memorial
       FROM users
      WHERE id = $1`,
    [userId],
  );
  return r.rows[0]?.is_memorial === true;
}

/**
 * Full memorial-state read for UI surfaces. Returns null when the account
 * is alive (memorial_at IS NULL) or does not exist. Surfaces that need to
 * render the <Memorial> badge call this.
 */
export async function getMemorialState(userId: string): Promise<MemorialState | null> {
  const r = await query(
    `SELECT memorial_at, memorial_steward_user_id, memorial_note
       FROM users
      WHERE id = $1
        AND memorial_at IS NOT NULL`,
    [userId],
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    memorialAt: row.memorial_at instanceof Date
      ? row.memorial_at.toISOString()
      : String(row.memorial_at),
    stewardUserId: row.memorial_steward_user_id ?? null,
    note: row.memorial_note ?? null,
  };
}
