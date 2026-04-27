// Admin moderation helpers — hide / unhide / appeal-resolve / dismiss.
//
// Mirrors @/lib/fraud/auto-suspend's pattern: each helper writes
// transition row, recomputes downstream trust score, returns. Idempotent
// against repeat calls.

import { query } from "@/lib/db";
import { logReviewTransition } from "./lifecycle-log";

interface AdminContext {
  actorLabel: string;
  reason?: string;
}

/**
 * Hide a review from public view. Side-effects:
 *   - admin_hidden = true
 *   - review_lifecycle_log row
 *   - trust score recompute for reviewee (the now-hidden review
 *     drops from their avg_rating + counts).
 */
export async function hideReview(reviewId: string, ctx: AdminContext): Promise<void> {
  const beforeRes = await query(
    `SELECT reviewee_id, admin_hidden FROM trade_reviews WHERE id = $1`,
    [reviewId],
  );
  if (beforeRes.rows.length === 0) throw new Error("Review not found");
  if (beforeRes.rows[0].admin_hidden === true) return; // idempotent

  await query(
    `UPDATE trade_reviews SET admin_hidden = true WHERE id = $1`,
    [reviewId],
  );
  void logReviewTransition({
    reviewId,
    action: "hidden",
    actorLabel: ctx.actorLabel,
    reason: ctx.reason ?? null,
  });

  // Recompute reviewee's trust score so the dropped review's
  // contribution flows out immediately. Without this, the score
  // would stay stale until the daily recompute cron tick.
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    void calculateTrustScore(beforeRes.rows[0].reviewee_id).catch((err) =>
      console.error(`[review/hide] trust recompute failed:`, err),
    );
  } catch { /* import failure ignored */ }
}

/**
 * Unhide a review (admin reversed an earlier hide, or appeal upheld).
 * Same shape as hide — log + recompute.
 */
export async function unhideReview(reviewId: string, ctx: AdminContext): Promise<void> {
  const beforeRes = await query(
    `SELECT reviewee_id, admin_hidden FROM trade_reviews WHERE id = $1`,
    [reviewId],
  );
  if (beforeRes.rows.length === 0) throw new Error("Review not found");
  if (beforeRes.rows[0].admin_hidden === false) return;

  await query(
    `UPDATE trade_reviews SET admin_hidden = false, flagged = false WHERE id = $1`,
    [reviewId],
  );
  void logReviewTransition({
    reviewId,
    action: "unhidden",
    actorLabel: ctx.actorLabel,
    reason: ctx.reason ?? null,
  });
  try {
    const { calculateTrustScore } = await import("@/lib/escrow/trust-engine");
    void calculateTrustScore(beforeRes.rows[0].reviewee_id).catch((err) =>
      console.error(`[review/unhide] trust recompute failed:`, err),
    );
  } catch { /* import failure ignored */ }
}

/** Customer-initiated appeal — stamps appealed_at + logs. */
export async function appealReview(reviewId: string, userId: string, reason: string): Promise<void> {
  // Only the reviewee can appeal a review about them.
  const r = await query(
    `SELECT reviewee_id, admin_hidden, appealed_at FROM trade_reviews WHERE id = $1`,
    [reviewId],
  );
  if (r.rows.length === 0) throw new Error("Review not found");
  if (r.rows[0].reviewee_id !== userId) throw new Error("Only the reviewee can appeal");
  if (r.rows[0].appealed_at) return; // already appealed; idempotent

  await query(
    `UPDATE trade_reviews
        SET appealed_at = NOW(),
            appeal_reason = $2,
            appeal_resolved = false
      WHERE id = $1`,
    [reviewId, reason],
  );
  void logReviewTransition({
    reviewId,
    action: "appealed",
    actorId: userId,
    reason,
  });
}
