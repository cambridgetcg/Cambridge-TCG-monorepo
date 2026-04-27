// Auto-suspend gate.
//
// When a user accumulates an unresolved high+ severity signal whose
// auto_action is 'suspend' (or 'critical' regardless of action), set
// trust_profiles.is_suspended = true, recompute their trust score,
// log the action to admin_actions_log as a system-driven entry, and
// stamp fraud_signals.notified_at so a re-run within the same tick
// doesn't re-emit the suspend.
//
// Counterpart: suspendUser / unsuspendUser helpers for admin-driven
// suspensions, sharing the same audit trail.

import { query } from "@/lib/db";
import { logAdminAction } from "@/lib/admin/governance-log";

const SYSTEM_ACTOR = "system:fraud-auto-suspend";

export interface SuspendResult {
  suspended: boolean;
  reason?: string;
  signalIds?: string[];
}

/**
 * Inspect a user's unresolved fraud signals and suspend if any
 * critical OR auto_action='suspend' signal exists. Idempotent —
 * already-suspended users no-op except to stamp signals as notified.
 */
export async function evaluateAutoSuspend(userId: string): Promise<SuspendResult> {
  const signalsRes = await query(
    `SELECT id, signal_type, severity, auto_action, description
       FROM fraud_signals
      WHERE user_id = $1 AND resolved = false
        AND (severity = 'critical' OR auto_action = 'suspend')
        AND notified_at IS NULL`,
    [userId],
  );
  const signals = signalsRes.rows;
  if (signals.length === 0) return { suspended: false };

  const reason = `Auto-suspend: ${signals.map((s) => s.signal_type).join(", ")}`;

  // Atomic flip — only one concurrent caller wins via the
  // `is_suspended = false` predicate. Both branches handle:
  //   - INSERT path (no profile row exists): RETURNING tells us
  //     whether we won the race
  //   - UPDATE path: WHERE-guarded so concurrent callers no-op
  //
  // We use a CTE to combine: if INSERT had a conflict, fall through
  // to a guarded UPDATE that returns 1 row only if WE flipped the bit.
  // The audit log then fires only on actuallyFlipped=true, eliminating
  // the duplicate-audit race window from the prior implementation.
  const flipRes = await query(
    `WITH ins AS (
       INSERT INTO trust_profiles (user_id, is_suspended, suspended_reason, suspended_at, updated_at)
       VALUES ($1, true, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO NOTHING
       RETURNING user_id
     ),
     upd AS (
       UPDATE trust_profiles
          SET is_suspended    = true,
              suspended_reason= COALESCE(suspended_reason, $2),
              suspended_at    = COALESCE(suspended_at, NOW()),
              updated_at      = NOW()
        WHERE user_id = $1
          AND is_suspended = false
          AND NOT EXISTS (SELECT 1 FROM ins)
        RETURNING user_id
     )
     SELECT user_id FROM ins UNION ALL SELECT user_id FROM upd`,
    [userId, reason],
  );
  const actuallyFlipped: boolean = (flipRes.rowCount ?? 0) > 0;

  // Mark signals as notified so the next cron tick doesn't re-trigger
  // the suspend pipeline for the same already-suspended user.
  await query(
    `UPDATE fraud_signals SET notified_at = NOW()
      WHERE id = ANY($1::uuid[])`,
    [signals.map((s) => s.id)],
  );

  // Recompute trust score so the suspended_at + signal counts flow into
  // the engine math immediately (otherwise score lies until the daily
  // recompute cron tick).
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    await calculateTrustScore(userId);
  } catch (err) {
    console.error(`[auto-suspend] trust recompute failed for ${userId}:`, err);
  }

  // Audit only when WE atomically flipped the bit — concurrent callers
  // on the same user pass through with actuallyFlipped=false so the
  // governance log gets exactly one row per suspension event.
  if (actuallyFlipped) {
    void logAdminAction({
      actorLabel: SYSTEM_ACTOR,
      targetUserId: userId,
      targetKind: "user",
      targetId: userId,
      action: "user.auto_suspend",
      beforeValue: { is_suspended: false },
      afterValue: { is_suspended: true, suspended_reason: reason },
      reason,
      metadata: {
        signal_ids: signals.map((s) => s.id),
        signal_types: signals.map((s) => s.signal_type),
      },
    });
  }

  return {
    suspended: actuallyFlipped,
    reason,
    signalIds: signals.map((s) => s.id),
  };
}

/**
 * Manual admin suspension. Mirrors the auto path so the audit + score
 * recompute are identical regardless of suspension origin.
 */
export async function suspendUser(args: {
  userId: string;
  reason: string;
  actorLabel: string;
}): Promise<void> {
  const before = await query(
    `SELECT is_suspended, suspended_reason FROM trust_profiles WHERE user_id = $1`,
    [args.userId],
  );
  await query(
    `INSERT INTO trust_profiles (user_id, is_suspended, suspended_reason, suspended_at, updated_at)
     VALUES ($1, true, $2, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       is_suspended    = true,
       suspended_reason= EXCLUDED.suspended_reason,
       suspended_at    = COALESCE(trust_profiles.suspended_at, NOW()),
       updated_at      = NOW()`,
    [args.userId, args.reason],
  );
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    await calculateTrustScore(args.userId);
  } catch (err) {
    console.error(`[suspend] trust recompute failed for ${args.userId}:`, err);
  }
  void logAdminAction({
    actorLabel: args.actorLabel,
    targetUserId: args.userId,
    targetKind: "user",
    targetId: args.userId,
    action: "user.suspend",
    beforeValue: before.rows[0] ?? null,
    afterValue: { is_suspended: true, suspended_reason: args.reason },
    reason: args.reason,
  });
}

export async function unsuspendUser(args: {
  userId: string;
  reason: string;
  actorLabel: string;
}): Promise<void> {
  const before = await query(
    `SELECT is_suspended, suspended_reason FROM trust_profiles WHERE user_id = $1`,
    [args.userId],
  );
  await query(
    `UPDATE trust_profiles
        SET is_suspended    = false,
            suspended_reason= NULL,
            updated_at      = NOW()
      WHERE user_id = $1`,
    [args.userId],
  );
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    await calculateTrustScore(args.userId);
  } catch (err) {
    console.error(`[unsuspend] trust recompute failed for ${args.userId}:`, err);
  }
  void logAdminAction({
    actorLabel: args.actorLabel,
    targetUserId: args.userId,
    targetKind: "user",
    targetId: args.userId,
    action: "user.unsuspend",
    beforeValue: before.rows[0] ?? null,
    afterValue: { is_suspended: false, suspended_reason: null },
    reason: args.reason,
  });
}
