// Admin audit logging — writes to admin_actions_log.
//
// Every consequential admin action should call logAdminAction().
// The admin_actions_log table (migration 0069) stores who did what,
// to whom, with before/after state diffs and operator reasoning.

import { query } from "@/lib/db";
import type { AdminSession } from "./auth";

export interface AuditEntry {
  /** The admin performing the action */
  admin: AdminSession;
  /** Optional non-personal label for records whose protocol must not retain
   * the admin email. actor_id still links to the live account until deletion. */
  actorLabelOverride?: string;
  /** Action identifier, e.g. 'user.suspend', 'tradein.approve' */
  action: string;
  /** Target entity kind, e.g. 'user', 'tradein', 'order' */
  targetKind: string;
  /** Target entity ID (string or UUID) */
  targetId?: string;
  /** If the target is a user, their user ID */
  targetUserId?: string;
  /** State before the action (for diffing) */
  beforeValue?: unknown;
  /** State after the action */
  afterValue?: unknown;
  /** Human-readable reason for the action */
  reason?: string;
  /** Arbitrary metadata */
  metadata?: unknown;
}

/**
 * Log an admin action to the audit trail.
 * Fire-and-forget — errors are caught and logged, never thrown.
 */
export async function logAdminAction(entry: AuditEntry): Promise<void> {
  try {
    await query(
      `INSERT INTO admin_actions_log
        (actor_id, actor_label, target_user_id, target_kind, target_id,
         action, before_value, after_value, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.admin.id,
        entry.actorLabelOverride ?? entry.admin.email,
        entry.targetUserId ?? null,
        entry.targetKind,
        entry.targetId ?? null,
        entry.action,
        entry.beforeValue ? JSON.stringify(entry.beforeValue) : null,
        entry.afterValue ? JSON.stringify(entry.afterValue) : null,
        entry.reason ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ]
    );
  } catch (err) {
    // Audit logging must never break the admin operation.
    // Log and continue — the action proceeds even if audit fails.
    console.error("[admin-audit] Failed to log action:", entry.action, err);
  }
}
