"use server";

/**
 * Reviews — server actions.
 *
 *   hideReview      — admin_hidden = true. Drops the review from public view.
 *   unhideReview    — admin_hidden = false. Restores it.
 *   resolveAppeal   — appeal_resolved = true (without flipping hide state).
 *
 * The reviewee's trust score is NOT recomputed inline — that's handled by
 * the storefront's maintenance cron sweep watching for review changes
 * (apps/storefront/src/lib/escrow/trust-recompute.ts). Substrate-honest:
 * admin's mutation triggers; the recompute is asynchronous.
 *
 * The storefront's `lib/reviews/lifecycle-log.ts` writes a per-action
 * trail; admin's adminAction governance log is the audit trail here. A
 * shared-package extraction would unify the two — flagged as a follow-up.
 */

import { adminAction, ActionInputError } from "@/lib/actions";
import { sfQuery } from "@/lib/db";

export interface ReviewMutationInput {
  id: string;
  reason: string;
}

export async function hideReview(input: ReviewMutationInput) {
  return adminAction({
    action: "review.hide",
    targetKind: "trade_review",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/reviews",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to hide a review.");
      }
      const r = await sfQuery<{ id: string; reviewee_id: string }>(
        `UPDATE trade_reviews
            SET admin_hidden = true,
                hidden_at = COALESCE(hidden_at, NOW())
          WHERE id = $1 AND admin_hidden = false
          RETURNING id::text, reviewee_id::text`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Review not found or already hidden.");
      }
      return { id: input.id, action: "hide" as const };
    },
  });
}

export async function unhideReview(input: ReviewMutationInput) {
  return adminAction({
    action: "review.unhide",
    targetKind: "trade_review",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/reviews",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError("Reason is required to unhide a review.");
      }
      const r = await sfQuery<{ id: string }>(
        `UPDATE trade_reviews
            SET admin_hidden = false
          WHERE id = $1 AND admin_hidden = true
          RETURNING id::text`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError("Review not found or not hidden.");
      }
      return { id: input.id, action: "unhide" as const };
    },
  });
}

export async function resolveAppeal(input: ReviewMutationInput) {
  return adminAction({
    action: "review.resolve_appeal",
    targetKind: "trade_review",
    targetId: input.id,
    reason: input.reason,
    revalidate: "/trust/reviews",
    run: async () => {
      if (!input.reason.trim()) {
        throw new ActionInputError(
          "Reason is required to resolve an appeal.",
        );
      }
      const r = await sfQuery<{ id: string }>(
        `UPDATE trade_reviews
            SET appeal_resolved = true
          WHERE id = $1
            AND appealed_at IS NOT NULL
            AND appeal_resolved = false
          RETURNING id::text`,
        [input.id],
      );
      if (r.rows.length === 0) {
        throw new ActionInputError(
          "Review not found, no open appeal, or already resolved.",
        );
      }
      return { id: input.id, action: "resolve_appeal" as const };
    },
  });
}
