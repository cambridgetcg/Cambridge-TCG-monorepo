// Daily review-pattern detection sweep.
//
// Each pass scans recent reviews for one suspicious pattern and emits
// flags through @/lib/reviews/flags.flagReview. Flags drive the admin
// moderation queue; auto-hide fires for high-severity patterns
// (review_bombing, retaliation) per the REVIEW_FLAG_DEFS.
//
// Self-gates to 04:45 UTC so it runs after the fraud sweep at 04:30
// (reviewers flagged for fraud get priority over reviewer-pattern
// flags downstream).

import { query } from "@/lib/db";
import { flagReview, REVIEW_FLAG_DEFS } from "./flags";

const UTC_HOUR_WINDOW = 4;
const UTC_MINUTE_WINDOW_START = 45;
const UTC_MINUTE_WINDOW_END = 47;

export interface ReviewSweepResult {
  ranInWindow: boolean;
  scanned: number;
  flagsRaised: number;
  autoHidden: number;
  failures: number;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW
    && now.getUTCMinutes() >= UTC_MINUTE_WINDOW_START
    && now.getUTCMinutes() <  UTC_MINUTE_WINDOW_END;
}

export async function runReviewPatternSweep(opts?: { force?: boolean }): Promise<ReviewSweepResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, scanned: 0, flagsRaised: 0, autoHidden: 0, failures: 0 };
  }
  const result: ReviewSweepResult = {
    ranInWindow: true,
    scanned: 0,
    flagsRaised: 0,
    autoHidden: 0,
    failures: 0,
  };

  // ── Pattern 1: Retaliation ──
  // 1-star review submitted by a user within 24h of being on the
  // losing side of a dispute on the same trade.
  try {
    const retalRes = await query(
      `SELECT r.id AS review_id
         FROM trade_reviews r
         JOIN trade_disputes d ON d.trade_id = r.trade_id
        WHERE r.created_at >= NOW() - INTERVAL '7 days'
          AND r.flagged = false
          AND r.rating = 1
          AND d.resolved_at IS NOT NULL
          AND d.resolved_at < r.created_at
          AND d.resolved_at > r.created_at - INTERVAL '24 hours'
          AND (
            (r.role = 'buyer'  AND d.resolution_type IN ('release_seller'))
            OR
            (r.role = 'seller' AND d.resolution_type IN ('refund_buyer', 'return_card'))
          )`,
    );
    for (const row of retalRes.rows) {
      result.scanned++;
      const r = await flagReview({
        reviewId: row.review_id,
        def: REVIEW_FLAG_DEFS.RETALIATION,
      });
      if (r.flagged) result.flagsRaised++;
      if (r.hidden) result.autoHidden++;
    }
  } catch (err) {
    result.failures++;
    console.error("[review-sweep] retaliation pass failed:", err);
  }

  // ── Pattern 2: Review bombing ──
  // ≥5 reviews ≤ 2 stars on the same reviewee within 7 days.
  try {
    const bombRes = await query(
      `WITH burst AS (
         SELECT reviewee_id
           FROM trade_reviews
          WHERE created_at >= NOW() - INTERVAL '7 days'
            AND rating <= 2
          GROUP BY reviewee_id
         HAVING COUNT(*) >= 5
       )
       SELECT r.id AS review_id
         FROM trade_reviews r
         JOIN burst b ON b.reviewee_id = r.reviewee_id
        WHERE r.created_at >= NOW() - INTERVAL '7 days'
          AND r.rating <= 2
          AND r.flagged = false`,
    );
    for (const row of bombRes.rows) {
      result.scanned++;
      const r = await flagReview({
        reviewId: row.review_id,
        def: REVIEW_FLAG_DEFS.REVIEW_BOMBING,
      });
      if (r.flagged) result.flagsRaised++;
      if (r.hidden) result.autoHidden++;
    }
  } catch (err) {
    result.failures++;
    console.error("[review-sweep] bombing pass failed:", err);
  }

  // ── Pattern 3: Mass positive from new accounts ──
  // ≥3 5-star reviews on the same reviewee in the last 14 days from
  // accounts < 14 days old.
  try {
    const massRes = await query(
      `WITH young_pos AS (
         SELECT r.reviewee_id, r.id AS review_id
           FROM trade_reviews r
           JOIN users u ON u.id = r.reviewer_id
          WHERE r.created_at >= NOW() - INTERVAL '14 days'
            AND r.rating = 5
            AND r.flagged = false
            AND u.created_at >= NOW() - INTERVAL '14 days'
       )
       SELECT review_id FROM young_pos
        WHERE reviewee_id IN (
          SELECT reviewee_id FROM young_pos GROUP BY reviewee_id HAVING COUNT(*) >= 3
        )`,
    );
    for (const row of massRes.rows) {
      result.scanned++;
      const r = await flagReview({
        reviewId: row.review_id,
        def: REVIEW_FLAG_DEFS.MASS_POSITIVE_NEW_ACCOUNT,
      });
      if (r.flagged) result.flagsRaised++;
      if (r.hidden) result.autoHidden++;
    }
  } catch (err) {
    result.failures++;
    console.error("[review-sweep] mass-positive pass failed:", err);
  }

  // ── Pattern 4: Duplicate text ──
  // Same comment text across multiple reviews by different reviewers
  // (case-insensitive, trimmed). Cheap n^2 group + existence check.
  try {
    const dupRes = await query(
      `WITH dup_text AS (
         SELECT LOWER(TRIM(comment)) AS norm_comment
           FROM trade_reviews
          WHERE comment IS NOT NULL
            AND length(TRIM(comment)) >= 30
            AND created_at >= NOW() - INTERVAL '30 days'
            AND flagged = false
          GROUP BY LOWER(TRIM(comment)), reviewer_id
       )
       SELECT r.id AS review_id
         FROM trade_reviews r
         JOIN (
           SELECT norm_comment FROM dup_text
            GROUP BY norm_comment HAVING COUNT(*) >= 2
         ) m ON LOWER(TRIM(r.comment)) = m.norm_comment
        WHERE r.flagged = false`,
    );
    for (const row of dupRes.rows) {
      result.scanned++;
      const r = await flagReview({
        reviewId: row.review_id,
        def: REVIEW_FLAG_DEFS.DUPLICATE_TEXT,
      });
      if (r.flagged) result.flagsRaised++;
      if (r.hidden) result.autoHidden++;
    }
  } catch (err) {
    result.failures++;
    console.error("[review-sweep] duplicate-text pass failed:", err);
  }

  return result;
}
