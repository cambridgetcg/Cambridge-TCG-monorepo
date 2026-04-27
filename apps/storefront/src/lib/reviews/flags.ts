// Review-pattern flag taxonomy.
//
// Reviews are user-generated reputation signals; the abuse surface is
// distinct from fraud_signals (which catches trade behaviour). Flags
// here drive Phase D's pattern-detection cron + admin moderation
// queue. Severity matches the fraud lib's ladder so the admin UI can
// share its tone palette.

import { query } from "@/lib/db";

export type ReviewFlagSeverity = "low" | "medium" | "high";

export interface ReviewFlagDef {
  type: string;
  severity: ReviewFlagSeverity;
  description: string;
  /** Whether the matching reviews should be auto-hidden pending
   *  admin review (true) or just surfaced in the moderation queue
   *  (false). High-severity patterns auto-hide; lower severities flag. */
  autoHide: boolean;
}

export const REVIEW_FLAG_DEFS = {
  RETALIATION: {
    type: "retaliation",
    severity: "high" as const,
    description: "1-star review submitted within 24h of the reviewer being on the losing side of a dispute",
    autoHide: true,
  },
  MASS_POSITIVE_NEW_ACCOUNT: {
    type: "mass_positive_new_account",
    severity: "medium" as const,
    description: "Cluster of 5-star reviews from accounts < 14 days old",
    autoHide: false,
  },
  REVIEW_BOMBING: {
    type: "review_bombing",
    severity: "high" as const,
    description: "≥5 sub-2-star reviews on the same reviewee within 7 days",
    autoHide: true,
  },
  DUPLICATE_TEXT: {
    type: "duplicate_text",
    severity: "medium" as const,
    description: "Identical comment text across multiple reviews by different reviewers",
    autoHide: false,
  },
} as const;

export interface FlagReviewArgs {
  reviewId: string;
  def: ReviewFlagDef;
  reason?: string;
}

/**
 * Mark a review as flagged + (if def.autoHide) hidden + log both
 * transitions. Idempotent — already-flagged reviews are no-ops.
 */
export async function flagReview(args: FlagReviewArgs): Promise<{ flagged: boolean; hidden: boolean }> {
  const { logReviewTransition } = await import("./lifecycle-log");

  const before = await query(
    `SELECT flagged, admin_hidden FROM trade_reviews WHERE id = $1`,
    [args.reviewId],
  );
  if (before.rows.length === 0) return { flagged: false, hidden: false };
  if (before.rows[0].flagged && before.rows[0].admin_hidden === args.def.autoHide) {
    return { flagged: false, hidden: false };
  }

  const reason = args.reason ?? args.def.description;
  await query(
    `UPDATE trade_reviews
        SET flagged = true,
            admin_hidden = $2 OR admin_hidden
      WHERE id = $1`,
    [args.reviewId, args.def.autoHide],
  );

  void logReviewTransition({
    reviewId: args.reviewId,
    action: "flagged",
    actorLabel: `system:${args.def.type}`,
    reason,
    metadata: { auto_hide: args.def.autoHide, severity: args.def.severity },
  });
  if (args.def.autoHide && !before.rows[0].admin_hidden) {
    void logReviewTransition({
      reviewId: args.reviewId,
      action: "hidden",
      actorLabel: `system:${args.def.type}`,
      reason: `Auto-hidden: ${args.def.description}`,
    });
  }

  return { flagged: !before.rows[0].flagged, hidden: args.def.autoHide && !before.rows[0].admin_hidden };
}
