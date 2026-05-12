/**
 * Per-user response window helpers — the Asynchronous's column in action.
 *
 * `users.response_window_hours` (migration 0092) is the per-user override
 * on the platform's many small "you must respond within X" deadlines.
 * Default 48 matches the historical global constant; values 1–8760 are
 * accepted (one hour to one year). When the user declares a slow-clock
 * cadence (e.g. 168 for one week), every user-response flow that reads
 * this column honors it.
 *
 * Two helpers:
 *   - `responseWindowHours(userId, defaultHours)` — raw lookup with
 *     a flow-specific default for users who haven't declared.
 *   - `paymentExpiresAtForBuyer(buyerId, defaultHours)` — ISO timestamp
 *     for INSERT into a `payment_expires_at` column.
 *
 * See `docs/connections/the-other-minds.md` (the Asynchronous),
 * `docs/methodology/response-windows.md` (customer-facing recipe).
 *
 * ── Why flow-specific defaults ───────────────────────────────────────
 *
 * Historical platform defaults vary by flow: P2P trade payment = 24h,
 * auction win payment = 48h, offer response = 48h. When a user *hasn't*
 * declared a cadence, the flow-specific default applies (the longstanding
 * behavior — every existing row inherits it). When the user *has*
 * declared, the declared value overrides for every flow uniformly.
 * Fast-clock account (12h declared) → every flow is 12h. Slow-clock
 * (168h) → every flow is 168h. Substrate-honest: the user's choice wins.
 */

import { query } from "@/lib/db";

/** Resolve a user's response_window_hours, falling back to a flow-specific default. */
export async function responseWindowHours(
  userId: string,
  defaultHours: number,
): Promise<number> {
  const r = await query(
    `SELECT response_window_hours FROM users WHERE id = $1`,
    [userId],
  );
  const declared = r.rows[0]?.response_window_hours as number | undefined;
  return declared ?? defaultHours;
}

/**
 * ISO timestamp for `payment_expires_at`-style columns. The buyer is the
 * party being asked to act (pay); their cadence governs.
 */
export async function paymentExpiresAtForBuyer(
  buyerId: string,
  defaultHours: number = 24,
): Promise<string> {
  const hours = await responseWindowHours(buyerId, defaultHours);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

/**
 * Helper for `*_expires_at` columns where a seller is asked to act
 * (ship, accept, decline). Mirrors `paymentExpiresAtForBuyer` semantically.
 */
export async function responseExpiresAtForUser(
  userId: string,
  defaultHours: number,
): Promise<string> {
  const hours = await responseWindowHours(userId, defaultHours);
  return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}
