// Append-only auction lifecycle audit log.
// Mirrors every other lifecycle log shipped this session.

import { query } from "@/lib/db";

export type AuctionAction =
  | "created"
  | "approved"
  | "live"
  | "extended"
  | "buy_now_triggered"
  | "ended_with_winner"
  | "ended_no_winner"
  | "paid"
  | "unpaid_lapsed"
  | "seller_shipped"
  | "received_by_ctcg"
  | "shipped_to_buyer"
  | "buyer_confirmed"
  | "completed"
  | "seller_paid_out"
  | "cancelled"
  | "admin_override";

export interface LogAuctionArgs {
  auctionId: string;
  action: AuctionAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logAuctionTransition(args: LogAuctionArgs): Promise<void> {
  await query(
    `INSERT INTO auction_lifecycle_log
       (auction_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.auctionId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[auction-log] insert failed (auction=${args.auctionId} action=${args.action}):`, err);
  });
}
