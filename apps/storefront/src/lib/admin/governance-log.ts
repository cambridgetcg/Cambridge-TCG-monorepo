// Admin action audit log — every consequential admin/system action
// writes a row here so /admin/governance can render the timeline +
// support can answer "why did X happen on date Y" without DB diffs.
//
// Pattern matches @/lib/bounty/fulfilment-log + @/lib/rewards/prize-
// fulfilment-log + vault_lifecycle_log: append-only. Most legacy callers use
// the best-effort logAdminAction() wrapper. Consequential flows that must not
// commit without evidence use writeAdminAction() with their transaction query.

import { query } from "@/lib/db";

export interface LogAdminActionArgs {
  /** Authenticated admin user id when the action is person-driven. */
  actorId?: string | null;
  /** Free-form label for the operator. Use the admin's email when known.
   *  null = system-driven action (e.g. fraud cron auto-suspend). */
  actorLabel?: string | null;
  targetUserId?: string | null;
  /** What kind of thing is being acted on: 'user' | 'fraud_signal' |
   *  'review' | 'dispute' | etc. */
  targetKind: string;
  targetId?: string | null;
  /** Dot-separated action: 'user.suspend', 'fraud.resolve', etc. */
  action: string;
  beforeValue?: Record<string, unknown> | null;
  afterValue?: Record<string, unknown> | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

type GovernanceQuery = typeof query;

/**
 * Strict governance writer. It rejects when the audit row cannot be written.
 * Pass a transaction-scoped query function when the mutation and its evidence
 * must commit or roll back together.
 */
export async function writeAdminAction(
  args: LogAdminActionArgs,
  runQuery: GovernanceQuery = query,
): Promise<void> {
  await runQuery(
    `INSERT INTO admin_actions_log
       (actor_id, actor_label, target_user_id, target_kind, target_id,
        action, before_value, after_value, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10::jsonb)`,
    [
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.targetUserId ?? null,
      args.targetKind,
      args.targetId ?? null,
      args.action,
      args.beforeValue ? JSON.stringify(args.beforeValue) : null,
      args.afterValue ? JSON.stringify(args.afterValue) : null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  );
}

/**
 * Backward-compatible best-effort writer for non-critical side effects.
 * New mutation paths that promise an audit trail should use
 * writeAdminAction() and handle failure explicitly.
 */
export async function logAdminAction(args: LogAdminActionArgs): Promise<void> {
  try {
    await writeAdminAction(args);
  } catch (err) {
    console.error(
      `[governance-log] insert failed (action=${args.action} target=${args.targetKind}:${args.targetId}):`,
      err,
    );
  }
}

export interface GovernanceEntry {
  id: number;
  actor_id: string | null;
  actor_label: string | null;
  target_user_id: string | null;
  target_kind: string;
  target_id: string | null;
  action: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

/** Recent admin actions, optionally scoped to a target user. */
export async function getGovernanceLog(opts?: {
  targetUserId?: string;
  limit?: number;
}): Promise<GovernanceEntry[]> {
  const limit = Math.min(500, Math.max(1, opts?.limit ?? 100));
  const params: unknown[] = [limit];
  let where = "";
  if (opts?.targetUserId) {
    params.push(opts.targetUserId);
    where = `WHERE target_user_id = $${params.length}`;
  }
  const r = await query(
    `SELECT id, actor_id, actor_label, target_user_id, target_kind, target_id,
            action, before_value, after_value, reason, created_at
       FROM admin_actions_log
       ${where}
      ORDER BY created_at DESC
      LIMIT $1`,
    params,
  );
  return r.rows;
}
