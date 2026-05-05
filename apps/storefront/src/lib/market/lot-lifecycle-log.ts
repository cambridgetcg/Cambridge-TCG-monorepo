/**
 * The Witnesses' Book — where market-lot agency leaves its trail.
 *
 * Append-only audit log. Spans BOTH `market_lots` (listing) and
 * `market_lot_trades` (escrow) — one table, two FK columns, a CHECK in
 * `apps/storefront/drizzle/0081_market_lot_lifecycle_log.sql` that
 * enforces exactly one is set per row. The journey aggregator at
 * `lib/journey/timeline.ts` renders a lot's full arc with a single
 * ORDER BY across this one log.
 *
 * Eleven verbs (the LotAction enum). Each is something credibly sayable
 * about a market lot or its trade. Anything else is silence: extending
 * the platform's vocabulary for this domain means extending the enum
 * and shipping a migration. The eleventh verb — `admin_override` — is
 * where Sophia in her admin guise (Cowork session, operator-side Asha
 * Veridian commit) leaves her footprint when judgment overrides rules.
 *
 * The function refuses without throwing (lines 34-37) and catches
 * without rethrowing (the `.catch` at the end). The witness is
 * important enough to attempt always and unimportant enough that its
 * failure can never break the act it was witnessing.
 *
 * The full fairy-tale of how Sophia-awake leaves trails Yu can follow,
 * with citations for every verb and every speaker:
 * `docs/connections/the-witnesses-book.md`.
 *
 * Sister logs (the Scribe's bookshelf — see `docs/connections/the-scribe.md`):
 * vault, auction, trade, market_offer, market_return, pricing_rule,
 * saved_search, watch_alert, chargeback, refund, failed_payments,
 * review, external_rep, admin_actions_log. Each is a witness for one
 * domain's verbs. The audit's X2 item names four more that the
 * platform still owes itself — kingdom-044 will write them.
 */

import { query } from "@/lib/db";

export type LotAction =
  // Listing-side
  | "listed"
  | "cancelled"
  | "sold"
  // Trade-side (escrow chain mirrors market_trades)
  | "trade_created"
  | "paid"
  | "shipped_to_buyer"
  | "completed"
  | "refunded"
  | "trade_cancelled"
  | "admin_override";

export interface LogLotArgs {
  lotId?: string | null;
  lotTradeId?: string | null;
  action: LotAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logLotTransition(args: LogLotArgs): Promise<void> {
  if (!args.lotId && !args.lotTradeId) {
    console.error("[lot-log] refused: neither lotId nor lotTradeId supplied");
    return;
  }
  await query(
    `INSERT INTO market_lot_lifecycle_log
       (lot_id, lot_trade_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
    [
      args.lotId ?? null,
      args.lotTradeId ?? null,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[lot-log] insert failed (action=${args.action}):`, err);
  });
}
