"use server";

/**
 * Disputes — server actions.
 *
 * Demonstrates the canonical adminAction shape: validate → mutate → return
 * { ok | error }. Governance log + revalidate handled by the wrapper.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  open:               ["under_review", "awaiting_evidence", "closed"],
  under_review:       ["awaiting_evidence", "resolved_buyer", "resolved_seller", "resolved_split", "closed"],
  awaiting_evidence:  ["under_review", "resolved_buyer", "resolved_seller", "resolved_split", "closed"],
  resolved_buyer:     ["closed"],
  resolved_seller:    ["closed"],
  resolved_split:     ["closed"],
  closed:             [], // terminal
};

const TIMESTAMP_COLUMN: Record<string, string | null> = {
  under_review:      "under_review_at",
  awaiting_evidence: "awaiting_evidence_at",
  resolved_buyer:    "resolved_at",
  resolved_seller:   "resolved_at",
  resolved_split:    "resolved_at",
  closed:            null, // no dedicated timestamp; updated_at suffices
};

export interface TransitionInput {
  id: string;
  to: string;
  reason: string;
}

export async function transitionDispute(input: TransitionInput) {
  return adminAction({
    action: `dispute.transition.${input.to}`,
    targetKind: "dispute",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/disputes",
    run: async () => {
      // ── Validate ────────────────────────────────────────────────────────
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to transition a dispute.");
      }

      const current = await sfQuery<{ status: string; raised_by: string }>(
        `SELECT status::text AS status, raised_by::text AS raised_by
           FROM trade_disputes WHERE id = $1::uuid`,
        [input.id],
      );
      if (current.rows.length === 0) {
        throw new ActionInputError(`Dispute ${input.id} not found.`);
      }
      const fromStatus = current.rows[0]!.status;

      if (!(input.to in ALLOWED_TRANSITIONS)) {
        throw new ActionInputError(`Unknown target status: ${input.to}`);
      }
      const allowed = ALLOWED_TRANSITIONS[fromStatus] ?? [];
      if (!allowed.includes(input.to)) {
        throw new ActionInputError(
          `Cannot transition from ${fromStatus} to ${input.to}. ` +
          `Allowed: ${allowed.join(", ") || "(terminal)"}.`,
        );
      }

      // ── Mutate ──────────────────────────────────────────────────────────
      const tsCol = TIMESTAMP_COLUMN[input.to];
      const setExtra = tsCol ? `, ${tsCol} = COALESCE(${tsCol}, NOW())` : "";
      const isResolved = input.to.startsWith("resolved_");

      await sfQuery(
        `UPDATE trade_disputes
            SET status = $1::dispute_status,
                resolution_notes = COALESCE(resolution_notes || E'\n---\n', '') || $2,
                resolved_by_admin = CASE WHEN $3::boolean THEN TRUE ELSE resolved_by_admin END,
                updated_at = NOW()
                ${setExtra}
          WHERE id = $4::uuid`,
        [input.to, input.reason, isResolved, input.id],
      );

      // Surface the prior + new status into the governance log via the
      // wrapper's `before`/`after` would require restructuring; we capture
      // it in the action name suffix and reason text instead.
      return {
        from: fromStatus,
        to: input.to,
        targetUserId: current.rows[0]!.raised_by,
      };
    },
  });
}
