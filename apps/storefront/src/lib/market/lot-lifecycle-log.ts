// Append-only market lot lifecycle audit log.
// Spans BOTH market_lots (listing) and market_lot_trades (escrow) —
// one table, two FK columns, a CHECK that enforces exactly one is set
// per row. Lets the journey aggregator render a lot's full arc with
// a single ORDER BY.

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
