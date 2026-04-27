// Append-only chargeback lifecycle log.
// Mirrors review_lifecycle_log + external_rep_lifecycle_log + every
// other lifecycle log shipped this session.

import { query } from "@/lib/db";

export type ChargebackAction =
  | "received"
  | "status_changed"
  | "fraud_emitted"
  | "evidence_uploaded"
  | "won"
  | "lost"
  | "admin_override";

export interface LogChargebackArgs {
  stripeDisputeId: string;
  action: ChargebackAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logChargebackTransition(args: LogChargebackArgs): Promise<void> {
  await query(
    `INSERT INTO chargeback_lifecycle_log
       (stripe_dispute_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.stripeDisputeId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[chargeback-log] insert failed (dispute=${args.stripeDisputeId}, action=${args.action}):`, err);
  });
}
