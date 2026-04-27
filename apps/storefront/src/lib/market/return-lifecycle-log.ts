// Append-only market return lifecycle audit log.
// Mirrors trade/offer/auction lifecycle helpers exactly.

import { query } from "@/lib/db";

export type ReturnAction =
  | "requested"
  | "accepted"
  | "declined"
  | "shipped_back"
  | "received"
  | "refunded"
  | "cancelled"
  | "expired"
  | "admin_override";

export interface LogReturnArgs {
  returnId: string;
  action: ReturnAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logReturnTransition(args: LogReturnArgs): Promise<void> {
  await query(
    `INSERT INTO market_return_lifecycle_log
       (return_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.returnId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[return-log] insert failed (return=${args.returnId} action=${args.action}):`, err);
  });
}
