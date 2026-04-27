// Append-only portfolio target lifecycle audit log.
// Mirrors trade/offer/return/lot/auction/rule/search lifecycle helpers.

import { query } from "@/lib/db";

export type TargetAction =
  | "created"
  | "updated"
  | "paused"
  | "resumed"
  | "cancelled"
  | "hit";

export interface LogTargetArgs {
  targetId: string;
  action: TargetAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logTargetTransition(args: LogTargetArgs): Promise<void> {
  await query(
    `INSERT INTO portfolio_target_lifecycle_log
       (target_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.targetId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[target-log] insert failed (target=${args.targetId} action=${args.action}):`, err);
  });
}
