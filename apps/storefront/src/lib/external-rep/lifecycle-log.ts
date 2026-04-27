// Append-only external-reputation lifecycle log.
// Mirrors review_lifecycle_log / vault_lifecycle_log / etc — same
// fire-and-forget shape, same actor_id + actor_label split for
// user vs system events.

import { query } from "@/lib/db";

export type ExternalRepAction =
  | "code_issued"
  | "verify_attempted"
  | "verify_succeeded"
  | "verify_failed"
  | "decay_triggered"
  | "decay_failed"
  | "admin_override"
  | "removed";

export interface LogExternalRepArgs {
  repId: string;
  action: ExternalRepAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logExternalRepTransition(args: LogExternalRepArgs): Promise<void> {
  await query(
    `INSERT INTO external_rep_lifecycle_log
       (rep_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.repId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[external-rep-log] insert failed (rep=${args.repId}, action=${args.action}):`, err);
  });
}
