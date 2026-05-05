"use server";

/**
 * Fraud signals — server actions.
 *
 * Mirrors the storefront /api/admin/fraud-signals route + bulk-resolve.
 * Mutations:
 *   resolveFraudSignal   — sets resolved=true with notes
 *   dismissFraudSignal   — same as resolve but separate audit verb
 *   escalateFraudSignal  — bumps severity one rung
 *   bulkResolveSignals   — batch resolve with one shared reason
 *   suspendUser          — sets trust_profiles.is_suspended=true. The
 *                          big-button escalation when the auto-suspend
 *                          gate didn't fire (e.g. high-severity but not
 *                          auto_action=suspend, accumulated pattern).
 *
 * Trust-score recompute is deferred to the storefront fraud sweep cron
 * (next tick) — admin app does not import storefront internals.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

const NEXT_SEVERITY: Record<string, string> = {
  low: "medium", medium: "high", high: "critical", critical: "critical",
};

const MAX_BULK = 50;

export interface ResolveInput {
  id: string;
  reason: string;
}

export async function resolveFraudSignal(input: ResolveInput) {
  return adminAction({
    action: "fraud.resolve",
    targetKind: "fraud_signal",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/fraud",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to resolve a signal.");
      }
      const before = await sfQuery<{ user_id: string; severity: string; resolved: boolean }>(
        `SELECT user_id::text AS user_id, severity, resolved
           FROM fraud_signals WHERE id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Signal ${input.id} not found.`);
      }
      if (before.rows[0]!.resolved) {
        throw new ActionInputError(`Signal ${input.id} is already resolved.`);
      }
      await sfQuery(
        `UPDATE fraud_signals
            SET resolved = true,
                resolved_notes = $2,
                resolved_by = NULL
          WHERE id = $1::uuid`,
        [input.id, `${input.reason} — resolved by ${admin.label}`],
      );
      return { id: input.id, user_id: before.rows[0]!.user_id };
    },
  });
}

export interface DismissInput {
  id: string;
  reason: string;
}

export async function dismissFraudSignal(input: DismissInput) {
  return adminAction({
    action: "fraud.dismiss",
    targetKind: "fraud_signal",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/fraud",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to dismiss a signal.");
      }
      const before = await sfQuery<{ user_id: string; severity: string; resolved: boolean }>(
        `SELECT user_id::text AS user_id, severity, resolved
           FROM fraud_signals WHERE id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Signal ${input.id} not found.`);
      }
      if (before.rows[0]!.resolved) {
        throw new ActionInputError(`Signal ${input.id} is already closed.`);
      }
      await sfQuery(
        `UPDATE fraud_signals
            SET resolved = true,
                resolved_notes = $2
          WHERE id = $1::uuid`,
        [input.id, `${input.reason} — dismissed by ${admin.label}`],
      );
      return { id: input.id, user_id: before.rows[0]!.user_id };
    },
  });
}

export interface EscalateInput {
  id: string;
  reason: string;
}

export async function escalateFraudSignal(input: EscalateInput) {
  return adminAction({
    action: "fraud.escalate",
    targetKind: "fraud_signal",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/fraud",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to escalate a signal.");
      }
      const before = await sfQuery<{ user_id: string; severity: string; resolved: boolean }>(
        `SELECT user_id::text AS user_id, severity, resolved
           FROM fraud_signals WHERE id = $1::uuid`,
        [input.id],
      );
      if (before.rows.length === 0) {
        throw new ActionInputError(`Signal ${input.id} not found.`);
      }
      if (before.rows[0]!.resolved) {
        throw new ActionInputError(`Cannot escalate a resolved signal.`);
      }
      const fromSeverity = before.rows[0]!.severity;
      const toSeverity = NEXT_SEVERITY[fromSeverity] ?? "high";
      if (toSeverity === fromSeverity) {
        throw new ActionInputError(`Severity ${fromSeverity} is already at the top.`);
      }
      await sfQuery(
        `UPDATE fraud_signals
            SET severity = $2,
                resolved_notes = COALESCE(resolved_notes || E'\n---\n', '') || $3
          WHERE id = $1::uuid`,
        [input.id, toSeverity, input.reason],
      );
      return { id: input.id, from: fromSeverity, to: toSeverity };
    },
  });
}

export interface BulkResolveInput {
  ids: string[];
  reason: string;
}

export async function bulkResolveSignals(input: BulkResolveInput) {
  return adminAction({
    action: "fraud.bulk_resolve",
    targetKind: "fraud_signal",
    targetId: null,
    reason: input.reason,
    revalidate: "/trust/fraud",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required for bulk-resolve.");
      }
      if (input.ids.length === 0) {
        throw new ActionInputError("Provide at least one signal id.");
      }
      if (input.ids.length > MAX_BULK) {
        throw new ActionInputError(`Maximum ${MAX_BULK} signals per bulk-resolve.`);
      }
      const r = await sfQuery<{ id: string }>(
        `UPDATE fraud_signals
            SET resolved = true,
                resolved_notes = $2
          WHERE id = ANY($1::uuid[]) AND resolved = false
          RETURNING id::text`,
        [input.ids, `${input.reason} — bulk-resolved by ${admin.label}`],
      );
      return { resolved_count: r.rows.length };
    },
  });
}

export interface SuspendInput {
  user_id: string;
  reason: string;
  signal_id?: string;
}

export async function suspendUser(input: SuspendInput) {
  return adminAction({
    action: "trust.suspend",
    targetKind: "user",
    targetId: input.user_id,
    targetUserId: input.user_id,
    reason: input.reason,
    revalidate: "/trust/fraud",
    run: async (admin) => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to suspend a user.");
      }
      // Idempotent: insert a trust profile if missing, then flip the flag.
      // Trust score recompute happens on next fraud sweep cron tick.
      const before = await sfQuery<{ is_suspended: boolean }>(
        `SELECT is_suspended FROM trust_profiles WHERE user_id = $1::uuid`,
        [input.user_id],
      );
      if (before.rows.length > 0 && before.rows[0]!.is_suspended) {
        throw new ActionInputError("User is already suspended.");
      }
      await sfQuery(
        `INSERT INTO trust_profiles (user_id, is_suspended)
              VALUES ($1::uuid, true)
         ON CONFLICT (user_id) DO UPDATE
              SET is_suspended = true`,
        [input.user_id],
      );
      // Optional cross-link in the related signal's notes — admins
      // tracing back from a signal will see the suspension was driven
      // from this triage.
      if (input.signal_id) {
        await sfQuery(
          `UPDATE fraud_signals
              SET resolved_notes =
                COALESCE(resolved_notes || E'\n---\n', '') ||
                $2
            WHERE id = $1::uuid`,
          [input.signal_id, `User suspended by ${admin.label}: ${input.reason}`],
        );
      }
      return { user_id: input.user_id, suspended: true };
    },
  });
}
