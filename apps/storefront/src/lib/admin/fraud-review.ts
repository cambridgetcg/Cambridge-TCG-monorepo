import type { AdminSession } from "@/lib/admin/auth";
import { writeAdminAction } from "@/lib/admin/governance-log";
import { transaction } from "@/lib/db";
import { calculateTrustScore } from "@/lib/escrow/trust-engine";

export type FraudReviewAction = "resolve" | "dismiss" | "escalate";
export const MIN_FRAUD_REVIEW_REASON_LENGTH = 10;

interface FraudSignalSnapshot {
  id: string;
  user_id: string;
  severity: "low" | "medium" | "high" | "critical";
  resolved: boolean;
  resolved_by: string | null;
  resolved_notes: string | null;
}

interface ReviewFailure {
  ok: false;
  status: 400 | 404 | 503;
  error: string;
  /** Whether the signal mutation and governance evidence committed. */
  committed: boolean;
  audited: boolean;
  signal?: FraudSignalSnapshot;
  failedUserIds?: string[];
}

interface ReviewSuccess {
  ok: true;
  status: 200;
  signal: FraudSignalSnapshot;
  committed: true;
  audited: true;
  trustRecomputed: true;
}

export type FraudReviewResult = ReviewFailure | ReviewSuccess;

const NEXT_SEVERITY: Record<
  FraudSignalSnapshot["severity"],
  FraudSignalSnapshot["severity"]
> = {
  low: "medium",
  medium: "high",
  high: "critical",
  critical: "critical",
};

/**
 * Apply one human fraud-review decision.
 *
 * The signal update and governance evidence share one database transaction.
 * Trust recomputation follows the commit and is awaited; if it fails, callers
 * receive an explicit committed=true response instead of a false success.
 */
export async function reviewFraudSignal(input: {
  admin: AdminSession;
  signalId: string;
  action: FraudReviewAction;
  reason: string;
}): Promise<FraudReviewResult> {
  const reason = input.reason.trim();
  if (reason.length < MIN_FRAUD_REVIEW_REASON_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `A human review reason of at least ${MIN_FRAUD_REVIEW_REASON_LENGTH} characters is required.`,
      committed: false,
      audited: false,
    };
  }

  let committed: FraudSignalSnapshot | null;
  try {
    committed = await transaction(async (q) => {
      const beforeResult = await q(
        `SELECT id, user_id, severity, resolved, resolved_by, resolved_notes
           FROM fraud_signals
          WHERE id = $1
          FOR UPDATE`,
        [input.signalId],
      );
      if (beforeResult.rows.length === 0) return null;
      const before = beforeResult.rows[0] as FraudSignalSnapshot;

      const updated =
        input.action === "escalate"
          ? await q(
              `UPDATE fraud_signals
              SET severity = $2,
                  resolved_notes = $3
            WHERE id = $1
            RETURNING id, user_id, severity, resolved, resolved_by, resolved_notes`,
              [
                input.signalId,
                NEXT_SEVERITY[before.severity] ?? "critical",
                reason,
              ],
            )
          : await q(
              `UPDATE fraud_signals
              SET resolved = true,
                  resolved_by = $2,
                  resolved_notes = $3
            WHERE id = $1
            RETURNING id, user_id, severity, resolved, resolved_by, resolved_notes`,
              [input.signalId, input.admin.id, reason],
            );
      const after = updated.rows[0] as FraudSignalSnapshot;

      await writeAdminAction(
        {
          actorId: input.admin.id,
          actorLabel: input.admin.email,
          targetUserId: before.user_id,
          targetKind: "fraud_signal",
          targetId: before.id,
          action: `fraud.${input.action}`,
          beforeValue: {
            severity: before.severity,
            resolved: before.resolved,
            resolved_by: before.resolved_by,
          },
          afterValue: {
            severity: after.severity,
            resolved: after.resolved,
            resolved_by: after.resolved_by,
          },
          reason,
        },
        q,
      );

      return after;
    });
  } catch (err) {
    console.error(
      "[fraud/review] mutation + governance transaction failed:",
      err,
    );
    return {
      ok: false,
      status: 503,
      error:
        "The signal was not changed because its governance record could not be committed with the review decision.",
      committed: false,
      audited: false,
    };
  }

  if (!committed) {
    return {
      ok: false,
      status: 404,
      error: "Signal not found.",
      committed: false,
      audited: false,
    };
  }

  try {
    await calculateTrustScore(committed.user_id);
  } catch (err) {
    console.error(
      `[fraud/review] trust recompute failed for ${committed.user_id}:`,
      err,
    );
    return {
      ok: false,
      status: 503,
      error:
        "The review decision and audit record were saved, but the affected trust score could not be recalculated. Retry the review or recalculate trust before relying on the displayed score.",
      committed: true,
      audited: true,
      signal: committed,
      failedUserIds: [committed.user_id],
    };
  }

  return {
    ok: true,
    status: 200,
    signal: committed,
    committed: true,
    audited: true,
    trustRecomputed: true,
  };
}

export interface BulkFraudReviewResult {
  ok: boolean;
  status: 200 | 400 | 404 | 503;
  error?: string;
  committed: boolean;
  audited: boolean;
  resolved: number;
  affectedUsers: number;
  failedUserIds: string[];
}

/** Resolve open signals as one audited transaction, then refresh each user. */
export async function bulkResolveFraudSignals(input: {
  admin: AdminSession;
  signalIds: string[];
  reason: string;
}): Promise<BulkFraudReviewResult> {
  const ids = Array.from(new Set(input.signalIds));
  const reason = input.reason.trim();
  if (reason.length < MIN_FRAUD_REVIEW_REASON_LENGTH) {
    return {
      ok: false,
      status: 400,
      error: `A human review reason of at least ${MIN_FRAUD_REVIEW_REASON_LENGTH} characters is required.`,
      committed: false,
      audited: false,
      resolved: 0,
      affectedUsers: 0,
      failedUserIds: [],
    };
  }
  let affected: FraudSignalSnapshot[];

  try {
    affected = await transaction(async (q) => {
      const beforeResult = await q(
        `SELECT id, user_id, severity, resolved, resolved_by, resolved_notes
           FROM fraud_signals
          WHERE id = ANY($1::uuid[])
            AND resolved = false
          ORDER BY id
          FOR UPDATE`,
        [ids],
      );
      const beforeRows = beforeResult.rows as FraudSignalSnapshot[];
      if (beforeRows.length === 0) return [];

      const updated = await q(
        `UPDATE fraud_signals
            SET resolved = true,
                resolved_by = $2,
                resolved_notes = $3
          WHERE id = ANY($1::uuid[])
            AND resolved = false
          RETURNING id, user_id, severity, resolved, resolved_by, resolved_notes`,
        [beforeRows.map((row) => row.id), input.admin.id, reason],
      );
      const afterById = new Map<string, FraudSignalSnapshot>(
        (updated.rows as FraudSignalSnapshot[]).map((row) => [row.id, row]),
      );

      for (const before of beforeRows) {
        const after = afterById.get(before.id);
        if (!after)
          throw new Error(
            `Fraud signal ${before.id} was locked but not updated.`,
          );
        await writeAdminAction(
          {
            actorId: input.admin.id,
            actorLabel: input.admin.email,
            targetUserId: before.user_id,
            targetKind: "fraud_signal",
            targetId: before.id,
            action: "fraud.resolve",
            beforeValue: {
              severity: before.severity,
              resolved: before.resolved,
              resolved_by: before.resolved_by,
            },
            afterValue: {
              severity: after.severity,
              resolved: after.resolved,
              resolved_by: after.resolved_by,
            },
            reason,
            metadata: { bulk: true, batch_size: beforeRows.length },
          },
          q,
        );
      }

      return updated.rows as FraudSignalSnapshot[];
    });
  } catch (err) {
    console.error(
      "[fraud/bulk-review] mutation + governance transaction failed:",
      err,
    );
    return {
      ok: false,
      status: 503,
      error:
        "No signals were changed because every review decision could not be committed with its governance record.",
      committed: false,
      audited: false,
      resolved: 0,
      affectedUsers: 0,
      failedUserIds: [],
    };
  }

  if (affected.length === 0) {
    return {
      ok: false,
      status: 404,
      error: "No open signals found.",
      committed: false,
      audited: false,
      resolved: 0,
      affectedUsers: 0,
      failedUserIds: [],
    };
  }

  const userIds = Array.from(new Set(affected.map((row) => row.user_id)));
  const recomputes = await Promise.allSettled(
    userIds.map((userId) => calculateTrustScore(userId)),
  );
  const failedUserIds = recomputes.flatMap((result, index) =>
    result.status === "rejected" ? [userIds[index]] : [],
  );

  if (failedUserIds.length > 0) {
    console.error(
      `[fraud/bulk-review] trust recompute failed for ${failedUserIds.length} affected user(s)`,
    );
    return {
      ok: false,
      status: 503,
      error:
        "The review decisions and audit records were saved, but some affected trust scores could not be recalculated.",
      committed: true,
      audited: true,
      resolved: affected.length,
      affectedUsers: userIds.length,
      failedUserIds,
    };
  }

  return {
    ok: true,
    status: 200,
    committed: true,
    audited: true,
    resolved: affected.length,
    affectedUsers: userIds.length,
    failedUserIds: [],
  };
}
