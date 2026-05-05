/**
 * Lifecycle registry — the bookshelf's slots.
 *
 * Each export here is one slot on the Scribe's bookshelf. Adding a new
 * lifecycle log to the platform = adding a new slot to this file. **No
 * other file on the platform should need to change** — that is the point
 * of the bookshelf. See docs/connections/the-scribe.md.
 *
 * Three slots are populated as exemplars in this commit:
 *   - admin_action  (target_user_id direct, simplest case)
 *   - chargeback    (one join via chargebacks)
 *   - trade         (join via market_trades, user is buyer or seller)
 *
 * The remaining thirteen slots are stubbed (not yet populated). When a
 * future builder adds one, the pattern is:
 *   1. Write `<domain>Slot: LifecycleSlot = { domain: '<domain>', forUser: async (userId, opts) => [...] }`
 *   2. Add it to the REGISTRY array below.
 *   3. Done. Every reader on the platform gains the new domain immediately.
 */

import { query } from "@/lib/db";
import type { LifecycleEntry, LifecycleSlot, ReadOptions } from "./types";

const DEFAULT_LIMIT = 50;

// ── admin_action ───────────────────────────────────────────────────────
// Reads admin_actions_log directly. The simplest case: the user is in
// `target_user_id` already. actor_label is free-form (audit A3).
const adminActionSlot: LifecycleSlot = {
  domain: "admin_action",
  async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const sinceClause = opts.since ? `AND created_at >= $3` : "";
    const params: unknown[] = [userId, limit];
    if (opts.since) params.push(opts.since.toISOString());

    const r = await query(
      `SELECT id::text AS id, actor_label, target_id AS subject_id,
              action, before_value, after_value, reason, created_at
         FROM admin_actions_log
        WHERE target_user_id = $1::uuid
          ${sinceClause}
        ORDER BY created_at DESC
        LIMIT $2`,
      params,
    );

    return r.rows.map((row) => ({
      domain: "admin_action" as const,
      action: row.action,
      actor_label: row.actor_label ?? null,
      actor_user_id: null, // not captured today; audit A3
      subject_id: String(row.subject_id ?? row.id),
      user_id: userId,
      reason: row.reason ?? null,
      metadata:
        row.before_value || row.after_value
          ? { before: row.before_value, after: row.after_value }
          : null,
      at: new Date(row.created_at),
    }));
  },
};

// ── chargeback ─────────────────────────────────────────────────────────
// Two-table read: chargeback_lifecycle_log JOIN chargebacks. The user is
// chargebacks.user_id (set when the dispute was raised — sometimes NULL
// for orphan chargebacks). Action vocabulary lives in the schema comment
// at drizzle/0072.
const chargebackSlot: LifecycleSlot = {
  domain: "chargeback",
  async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
    const params: unknown[] = [userId, limit];
    if (opts.since) params.push(opts.since.toISOString());

    const r = await query(
      `SELECT log.id::text AS id, log.action, log.actor_label, log.actor_id,
              log.reason, log.metadata, log.created_at,
              log.stripe_dispute_id AS subject_id, c.user_id::text AS user_id
         FROM chargeback_lifecycle_log log
         JOIN chargebacks c ON c.stripe_dispute_id = log.stripe_dispute_id
        WHERE c.user_id = $1::uuid
          ${sinceClause}
        ORDER BY log.created_at DESC
        LIMIT $2`,
      params,
    );

    return r.rows.map((row) => ({
      domain: "chargeback" as const,
      action: row.action,
      actor_label: row.actor_label ?? null,
      actor_user_id: row.actor_id ?? null,
      subject_id: row.subject_id,
      user_id: row.user_id ?? userId,
      reason: row.reason ?? null,
      metadata: row.metadata ?? null,
      at: new Date(row.created_at),
    }));
  },
};

// ── trade ──────────────────────────────────────────────────────────────
// Two-table read: trade_lifecycle_log JOIN market_trades. The user is
// either buyer_id or seller_id — both produce entries (a trade has two
// stakeholders; both see its events on their own timelines).
const tradeSlot: LifecycleSlot = {
  domain: "trade",
  async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
    const limit = opts.limit ?? DEFAULT_LIMIT;
    const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
    const params: unknown[] = [userId, limit];
    if (opts.since) params.push(opts.since.toISOString());

    const r = await query(
      `SELECT log.id::text AS id, log.action, log.actor_label, log.actor_id,
              log.reason, log.metadata, log.created_at,
              log.trade_id::text AS subject_id,
              CASE WHEN t.buyer_id = $1::uuid THEN 'buyer'
                   WHEN t.seller_id = $1::uuid THEN 'seller'
                   ELSE 'unknown' END AS role
         FROM trade_lifecycle_log log
         JOIN market_trades t ON t.id = log.trade_id
        WHERE (t.buyer_id = $1::uuid OR t.seller_id = $1::uuid)
          ${sinceClause}
        ORDER BY log.created_at DESC
        LIMIT $2`,
      params,
    );

    return r.rows.map((row) => {
      // Augment metadata with the role (buyer/seller) so renderers can
      // shape directional copy without a second query.
      const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
      const metadata = { ...baseMeta, role: row.role };
      return {
        domain: "trade" as const,
        action: row.action,
        actor_label: row.actor_label ?? null,
        actor_user_id: row.actor_id ?? null,
        subject_id: row.subject_id,
        user_id: userId,
        reason: row.reason ?? null,
        metadata,
        at: new Date(row.created_at),
      };
    });
  },
};

/**
 * The bookshelf. Add a new slot here when you add a new lifecycle log.
 *
 * Order doesn't matter — the reader sorts by `at` after composing.
 * Stubbed slots (not yet populated): refund, failed_payment, review,
 * vault, prize, external_rep, auction, market_offer, market_return,
 * market_lot, pricing_rule, saved_search, watch_alert. Each follows
 * the pattern of one of the three above.
 */
export const REGISTRY: readonly LifecycleSlot[] = [
  adminActionSlot,
  chargebackSlot,
  tradeSlot,
];
