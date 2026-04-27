// Append-only refund lifecycle log — same shape as every other
// lifecycle log shipped this session.

import { query } from "@/lib/db";

export type RefundAction =
  | "received"
  | "status_changed"
  | "abuse_checked"
  | "admin_override";

export interface LogRefundArgs {
  stripeRefundId: string;
  action: RefundAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logRefundTransition(args: LogRefundArgs): Promise<void> {
  await query(
    `INSERT INTO refund_lifecycle_log
       (stripe_refund_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.stripeRefundId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[refund-log] insert failed (refund=${args.stripeRefundId}, action=${args.action}):`, err);
  });
}
