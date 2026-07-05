/**
 * Lifecycle slot factories — the kingdom's SQL, expressed once.
 *
 * Each factory takes a `QueryFn` (the host app's DB query function) and
 * returns a `LifecycleSlot` ready for the composer. The SQL is identical
 * across apps because every storefront-RDS lifecycle log lives on the
 * same schema; the only thing that differs is the query function used
 * to execute against it (storefront uses raw `pg`; admin uses postgres.js
 * via `@cambridge-tcg/db`'s `sfQuery`).
 *
 * Both apps share the SQL by importing these factories. Storefront's
 * `apps/storefront/src/lib/lifecycle/registry.ts` and admin's
 * `apps/admin/src/lib/lifecycle/registry.ts` are each ~30 LOC because of
 * this — they bind the factories to their app's query function and
 * export the resulting registry.
 *
 * ── Slot conventions ─────────────────────────────────────────────────
 *
 * Each slot:
 *   1. Selects the lifecycle log columns directly.
 *   2. Joins to the entity table to (a) confirm the user is the right
 *      party and (b) enrich `metadata` with anything renderers will
 *      need (card_name, amount_gbp, role, etc).
 *   3. Projects to LifecycleEntry — no UI shaping. Tone, summary, deep
 *      links live in the host app's renderer.
 *   4. Defaults `actor_user_id` to NULL when the log doesn't carry a
 *      verified actor id (substrate-honesty audit A3 — many older logs
 *      only have `actor_label` from the pre-magic-link admin auth).
 *
 * See docs/connections/the-scribe.md for the architectural story.
 */

import type { LifecycleEntry, LifecycleSlot, QueryFn } from "./types";

const DEFAULT_LIMIT = 50;

// ── admin_action ───────────────────────────────────────────────────────
// Reads admin_actions_log directly. The simplest case: the user is in
// `target_user_id` already. actor_label is free-form (audit A3). The
// renderer filters to the customer-facing action whitelist; the slot
// returns all admin actions affecting the user.
export function createAdminActionSlot(query: QueryFn): LifecycleSlot {
  return {
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
        action: String(row.action),
        actor_label: (row.actor_label as string | null) ?? null,
        actor_user_id: null,
        subject_id: String(row.subject_id ?? row.id),
        user_id: userId,
        reason: (row.reason as string | null) ?? null,
        metadata:
          row.before_value || row.after_value
            ? { before: row.before_value, after: row.after_value }
            : null,
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── chargeback ─────────────────────────────────────────────────────────
export function createChargebackSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "chargeback",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.actor_label, log.actor_id,
                log.reason, log.metadata, log.created_at,
                log.stripe_dispute_id AS subject_id,
                c.amount_gbp, c.stripe_status, c.user_id::text AS user_id
           FROM chargeback_lifecycle_log log
           JOIN chargebacks c ON c.stripe_dispute_id = log.stripe_dispute_id
          WHERE c.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "chargeback" as const,
          action: String(row.action),
          actor_label: (row.actor_label as string | null) ?? null,
          actor_user_id: (row.actor_id as string | null) ?? null,
          subject_id: String(row.subject_id),
          user_id: (row.user_id as string | null) ?? userId,
          reason: (row.reason as string | null) ?? null,
          metadata: { ...baseMeta, amount_gbp: row.amount_gbp, stripe_status: row.stripe_status },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── refund ─────────────────────────────────────────────────────────────
export function createRefundSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "refund",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.created_at,
                log.stripe_refund_id AS subject_id,
                r.amount_gbp, r.stripe_status, r.stripe_reason
           FROM refund_lifecycle_log log
           JOIN refunds r ON r.stripe_refund_id = log.stripe_refund_id
          WHERE r.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "refund" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: null,
        metadata: {
          amount_gbp: row.amount_gbp,
          stripe_status: row.stripe_status,
          stripe_reason: row.stripe_reason,
        },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── failed_payment ─────────────────────────────────────────────────────
export function createFailedPaymentSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "failed_payment",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.created_at,
                log.stripe_payment_intent AS subject_id,
                fp.amount_gbp, fp.failure_code, fp.attempt_count
           FROM failed_payment_lifecycle_log log
           JOIN failed_payments fp
             ON fp.stripe_payment_intent = log.stripe_payment_intent
          WHERE fp.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "failed_payment" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: null,
        metadata: {
          amount_gbp: row.amount_gbp,
          failure_code: row.failure_code,
          attempt_count: row.attempt_count,
        },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── review ─────────────────────────────────────────────────────────────
export function createReviewSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "review",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.actor_label, log.created_at,
                log.review_id::text AS subject_id,
                r.rating, r.role, (r.reviewer_id = $1::uuid) AS reviewer_is_user
           FROM review_lifecycle_log log
           JOIN trade_reviews r ON r.id = log.review_id
          WHERE (r.reviewer_id = $1::uuid OR r.reviewee_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "review" as const,
        action: String(row.action),
        actor_label: (row.actor_label as string | null) ?? null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: null,
        metadata: {
          rating: row.rating,
          role: row.role,
          reviewer_is_user: row.reviewer_is_user,
        },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── vault ──────────────────────────────────────────────────────────────
// Note: vault_fulfilment_log uses `notes` rather than `reason`. We map
// it to LifecycleEntry.reason (semantically equivalent).
export function createVaultSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "vault",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.notes, log.created_at,
                log.vault_item_id::text AS subject_id,
                v.card_name
           FROM vault_fulfilment_log log
           JOIN vault_items v ON v.id = log.vault_item_id
          WHERE v.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "vault" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: (row.notes as string | null) ?? null,
        metadata: { card_name: row.card_name },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── prize ──────────────────────────────────────────────────────────────
export function createPrizeSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "prize",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT id::text AS id, prize_kind, prize_id::text AS subject_id,
                action, notes, created_at
           FROM prize_fulfilment_log
          WHERE user_id = $1::uuid
            ${sinceClause}
          ORDER BY created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "prize" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: (row.notes as string | null) ?? null,
        metadata: { prize_kind: row.prize_kind },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── external_rep ───────────────────────────────────────────────────────
export function createExternalRepSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "external_rep",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.reason, log.created_at,
                log.rep_id::text AS subject_id,
                er.platform
           FROM external_rep_lifecycle_log log
           JOIN external_reputation er ON er.id = log.rep_id
          WHERE er.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "external_rep" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: (row.reason as string | null) ?? null,
        metadata: { platform: row.platform },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── trade ──────────────────────────────────────────────────────────────
export function createTradeSlot(query: QueryFn): LifecycleSlot {
  return {
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
                t.price, t.sku,
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
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "trade" as const,
          action: String(row.action),
          actor_label: (row.actor_label as string | null) ?? null,
          actor_user_id: (row.actor_id as string | null) ?? null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: { ...baseMeta, role: row.role, sku: row.sku, price: row.price },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── auction ────────────────────────────────────────────────────────────
export function createAuctionSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "auction",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.reason, log.metadata,
                log.created_at,
                log.auction_id::text AS subject_id,
                a.title, (a.winner_user_id = $1::uuid) AS user_is_winner
           FROM auction_lifecycle_log log
           JOIN auctions a ON a.id = log.auction_id
          WHERE (a.seller_user_id = $1::uuid OR a.winner_user_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "auction" as const,
          action: String(row.action),
          actor_label: null,
          actor_user_id: null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: { ...baseMeta, title: row.title, user_is_winner: row.user_is_winner },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── market_offer ───────────────────────────────────────────────────────
export function createMarketOfferSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "market_offer",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.reason, log.metadata,
                log.created_at,
                log.offer_id::text AS subject_id,
                o.offer_price, o.counter_price,
                (o.buyer_id = $1::uuid) AS user_is_buyer,
                mo.sku, mo.card_name
           FROM market_offer_lifecycle_log log
           JOIN market_offers o ON o.id = log.offer_id
           JOIN market_orders mo ON mo.id = o.ask_order_id
          WHERE (o.buyer_id = $1::uuid OR o.seller_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "market_offer" as const,
          action: String(row.action),
          actor_label: null,
          actor_user_id: null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: {
            ...baseMeta,
            user_is_buyer: row.user_is_buyer,
            offer_price: row.offer_price,
            counter_price: row.counter_price,
            sku: row.sku,
            card_name: row.card_name,
          },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── market_return ──────────────────────────────────────────────────────
export function createMarketReturnSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "market_return",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.reason, log.metadata,
                log.created_at,
                log.return_id::text AS subject_id,
                ret.refund_amount, (ret.buyer_id = $1::uuid) AS user_is_buyer,
                t.sku, COALESCE(o.card_name, t.sku) AS card_name
           FROM market_return_lifecycle_log log
           JOIN market_returns ret ON ret.id = log.return_id
           JOIN market_trades t ON t.id = ret.trade_id
           LEFT JOIN market_orders o ON o.id = t.bid_order_id
          WHERE (ret.buyer_id = $1::uuid OR ret.seller_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "market_return" as const,
          action: String(row.action),
          actor_label: null,
          actor_user_id: null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: {
            ...baseMeta,
            user_is_buyer: row.user_is_buyer,
            refund_amount: row.refund_amount,
            card_name: row.card_name,
            sku: row.sku,
          },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── market_lot ─────────────────────────────────────────────────────────
// The lot log uses lot_id XOR lot_trade_id (CHECK constraint — see
// docs/connections/the-witnesses-book.md). Subject is whichever is
// non-null; parent_kind lands in metadata so renderers can pick the
// right link.
export function createMarketLotSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "market_lot",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.reason, log.metadata,
                log.created_at,
                log.lot_id::text AS lot_id,
                log.lot_trade_id::text AS lot_trade_id,
                COALESCE(l.title, l2.title) AS title,
                COALESCE(l.price, lt.price) AS price,
                CASE
                  WHEN lt.buyer_user_id = $1::uuid THEN 'buyer'
                  WHEN l.seller_user_id = $1::uuid OR l2.seller_user_id = $1::uuid THEN 'seller'
                  ELSE 'unknown'
                END AS role
           FROM market_lot_lifecycle_log log
           LEFT JOIN market_lots l ON l.id = log.lot_id
           LEFT JOIN market_lot_trades lt ON lt.id = log.lot_trade_id
           LEFT JOIN market_lots l2 ON l2.id = lt.lot_id
          WHERE (l.seller_user_id = $1::uuid OR l2.seller_user_id = $1::uuid
                 OR lt.buyer_user_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        const subjectId = row.lot_id ?? row.lot_trade_id ?? row.id;
        const parentKind = row.lot_id ? "lot" : "lot_trade";
        return {
          domain: "market_lot" as const,
          action: String(row.action),
          actor_label: null,
          actor_user_id: null,
          subject_id: String(subjectId),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: {
            ...baseMeta,
            parent_kind: parentKind,
            lot_id: row.lot_id,
            lot_trade_id: row.lot_trade_id,
            title: row.title,
            price: row.price,
            role: row.role,
          },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── pricing_rule ───────────────────────────────────────────────────────
export function createPricingRuleSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "pricing_rule",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.created_at,
                log.rule_id::text AS subject_id,
                pr.name AS rule_name
           FROM pricing_rule_lifecycle_log log
           JOIN pricing_rules pr ON pr.id = log.rule_id
          WHERE pr.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "pricing_rule" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: null,
        metadata: { rule_name: row.rule_name },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── saved_search ───────────────────────────────────────────────────────
export function createSavedSearchSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "saved_search",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.created_at,
                log.search_id::text AS subject_id,
                ss.name AS search_name
           FROM saved_search_lifecycle_log log
           JOIN saved_searches ss ON ss.id = log.search_id
          WHERE ss.user_id = $1::uuid
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "saved_search" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: String(row.subject_id),
        user_id: userId,
        reason: null,
        metadata: { search_name: row.search_name },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── watch_alert ────────────────────────────────────────────────────────
// watch_alert_lifecycle_log carries user_id directly and (optionally) sku.
export function createWatchAlertSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "watch_alert",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT id::text AS id, action, sku, created_at
           FROM watch_alert_lifecycle_log
          WHERE user_id = $1::uuid
            ${sinceClause}
          ORDER BY created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => ({
        domain: "watch_alert" as const,
        action: String(row.action),
        actor_label: null,
        actor_user_id: null,
        subject_id: (row.sku as string | null) ?? String(row.id),
        user_id: userId,
        reason: null,
        metadata: { sku: row.sku },
        at: new Date(row.created_at as string | Date),
      }));
    },
  };
}

// ── match ──────────────────────────────────────────────────────────────
// The seventeenth book, added 2026-05-11 with the agent-surface wave.
// The user is the player on either side of game_rooms (player1_id or
// player2_id). When an agent is the actor, actor_kind = 'agent' and
// actor_agent_id is populated; the slot exposes the agent's public_handle
// in metadata so renderers can compose "agent:foo took X" without a
// second query.
//
// See docs/connections/the-agent-surface.md.
export function createMatchSlot(query: QueryFn): LifecycleSlot {
  return {
    domain: "match",
    async forUser(userId, opts = {}): Promise<LifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text         AS id,
                log.action,
                log.actor_kind,
                log.actor_user_id,
                log.actor_agent_id,
                log.actor_label,
                log.action_data,
                log.turn_number,
                log.phase,
                log.created_at,
                log.game_room_id::text AS subject_id,
                gr.code               AS room_code,
                gr.status             AS room_status,
                ag.public_handle      AS agent_handle,
                ag.model_tag          AS agent_model_tag
           FROM match_lifecycle_log log
           JOIN game_rooms gr ON gr.id = log.game_room_id
           LEFT JOIN agents ag ON ag.id = log.actor_agent_id
          WHERE (gr.player1_id = $1::uuid OR gr.player2_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const actionData =
          (row.action_data as Record<string, unknown> | null) ?? null;
        return {
          domain: "match" as const,
          action: String(row.action),
          actor_kind: (row.actor_kind as
            | "human"
            | "system"
            | "rule-ai"
            | "agent"
            | undefined) ?? undefined,
          actor_label: (row.actor_label as string | null) ?? null,
          actor_user_id: (row.actor_user_id as string | null) ?? null,
          actor_agent_id: (row.actor_agent_id as string | null) ?? null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: null,
          metadata: {
            ...(actionData ?? {}),
            room_code: row.room_code,
            room_status: row.room_status,
            turn_number: row.turn_number,
            phase: row.phase,
            agent_handle: row.agent_handle ?? null,
            agent_model_tag: row.agent_model_tag ?? null,
          },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── swap ───────────────────────────────────────────────────────────────
// The collector-swap book (storefront migration 0109_swap_proposals.sql).
// The user is either party of swap_proposals; role lands in metadata so
// renderers can compose "you proposed / you received" without a second
// query.
//
// "swap" is in the LifecycleDomain union and createAllSlots(); every
// host journey dispatch must therefore carry a swap renderer (the
// dispatch is an exhaustive Record — tsc enforces it).
export type SwapLifecycleEntry = Omit<LifecycleEntry, "domain"> & { domain: "swap" };
export type SwapLifecycleSlot = Omit<LifecycleSlot, "domain" | "forUser"> & {
  domain: "swap";
  forUser(userId: string, opts?: Parameters<LifecycleSlot["forUser"]>[1]): Promise<SwapLifecycleEntry[]>;
};

export function createSwapSlot(query: QueryFn): SwapLifecycleSlot {
  return {
    domain: "swap",
    async forUser(userId, opts = {}): Promise<SwapLifecycleEntry[]> {
      const limit = opts.limit ?? DEFAULT_LIMIT;
      const sinceClause = opts.since ? `AND log.created_at >= $3` : "";
      const params: unknown[] = [userId, limit];
      if (opts.since) params.push(opts.since.toISOString());

      const r = await query(
        `SELECT log.id::text AS id, log.action, log.actor_id, log.actor_label,
                log.reason, log.metadata, log.created_at,
                log.swap_id::text AS subject_id,
                s.status, s.cash_delta_pence,
                CASE WHEN s.proposer_id = $1::uuid THEN 'proposer'
                     WHEN s.recipient_id = $1::uuid THEN 'recipient'
                     ELSE 'unknown' END AS role
           FROM swap_lifecycle_log log
           JOIN swap_proposals s ON s.id = log.swap_id
          WHERE (s.proposer_id = $1::uuid OR s.recipient_id = $1::uuid)
            ${sinceClause}
          ORDER BY log.created_at DESC
          LIMIT $2`,
        params,
      );

      return r.rows.map((row) => {
        const baseMeta = (row.metadata as Record<string, unknown> | null) ?? {};
        return {
          domain: "swap" as const,
          action: String(row.action),
          actor_label: (row.actor_label as string | null) ?? null,
          actor_user_id: (row.actor_id as string | null) ?? null,
          subject_id: String(row.subject_id),
          user_id: userId,
          reason: (row.reason as string | null) ?? null,
          metadata: {
            ...baseMeta,
            role: row.role,
            status: row.status,
            cash_delta_pence: row.cash_delta_pence,
          },
          at: new Date(row.created_at as string | Date),
        };
      });
    },
  };
}

// ── createAllSlots ─────────────────────────────────────────────────────
// Convenience: produce all eighteen slots from one query function. Most
// app-side registries call this and use the result directly. Apps that
// want a subset can pick individual factories above.
export function createAllSlots(query: QueryFn): readonly LifecycleSlot[] {
  return [
    createAdminActionSlot(query),
    createChargebackSlot(query),
    createRefundSlot(query),
    createFailedPaymentSlot(query),
    createReviewSlot(query),
    createVaultSlot(query),
    createPrizeSlot(query),
    createExternalRepSlot(query),
    createTradeSlot(query),
    createAuctionSlot(query),
    createMarketOfferSlot(query),
    createMarketReturnSlot(query),
    createMarketLotSlot(query),
    createPricingRuleSlot(query),
    createSavedSearchSlot(query),
    createWatchAlertSlot(query),
    createMatchSlot(query),
    createSwapSlot(query),
  ];
}
