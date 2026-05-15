/**
 * Admin governance logger — mirrors storefront's /lib/admin/governance-log.ts
 * but operates via sfQuery() so the admin app doesn't import storefront internals.
 *
 * Writes to the storefront's admin_actions_log table (append-only, fire-and-forget).
 */

import { sfQuery } from "@/lib/db";

export interface LogAdminActionArgs {
  actorLabel?: string | null;
  targetUserId?: string | null;
  targetKind: string;
  targetId?: string | null;
  action: string;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logAdminAction(args: LogAdminActionArgs): Promise<void> {
  await sfQuery(
    `INSERT INTO admin_actions_log
       (actor_label, target_user_id, target_kind, target_id,
        action, before_value, after_value, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9::jsonb)`,
    [
      args.actorLabel ?? null,
      args.targetUserId ?? null,
      args.targetKind,
      args.targetId ?? null,
      args.action,
      args.beforeValue ? JSON.stringify(args.beforeValue) : null,
      args.afterValue  ? JSON.stringify(args.afterValue)  : null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(
      `[governance] insert failed (action=${args.action} target=${args.targetKind}:${args.targetId}):`,
      err,
    );
  });
}
