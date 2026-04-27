// Append-only market trade lifecycle audit log.
// Mirrors auction_lifecycle_log + helper. The action enum tracks
// every escrow_status transition plus a couple of admin-side labels
// (admin_override, evidence_added) that don't move the FSM.

import { query } from "@/lib/db";

export type TradeAction =
  | "created"
  | "paid"
  | "awaiting_shipment"
  | "shipped_to_ctcg"
  | "received_by_ctcg"
  | "verified"
  | "shipped_to_buyer"
  | "completed"
  | "disputed"
  | "refunded"
  | "cancelled"
  | "evidence_added"
  | "admin_override";

export interface LogTradeArgs {
  tradeId: string;
  action: TradeAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logTradeTransition(args: LogTradeArgs): Promise<void> {
  await query(
    `INSERT INTO trade_lifecycle_log
       (trade_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.tradeId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[trade-log] insert failed (trade=${args.tradeId} action=${args.action}):`, err);
  });
}
