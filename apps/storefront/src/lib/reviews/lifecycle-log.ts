// Append-only review lifecycle audit. Mirrors the now-canonical pattern:
// vault_lifecycle_log → prize_fulfilment_log → admin_actions_log →
// review_lifecycle_log. One row per transition, fire-and-forget, never
// throws (a logging failure must never block the underlying action).

import { query } from "@/lib/db";

export type ReviewAction =
  | "submitted"
  | "hidden"
  | "unhidden"
  | "flagged"
  | "appealed"
  | "appeal_dismissed"
  | "unpublished"
  | "edited";

export interface LogReviewArgs {
  reviewId: string;
  action: ReviewAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logReviewTransition(args: LogReviewArgs): Promise<void> {
  await query(
    `INSERT INTO review_lifecycle_log
       (review_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.reviewId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(
      `[review-log] insert failed (review=${args.reviewId} action=${args.action}):`,
      err,
    );
  });
}

export interface ReviewLifecycleEntry {
  id: number;
  action: ReviewAction;
  actor_id: string | null;
  actor_label: string | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getReviewLifecycle(reviewId: string): Promise<ReviewLifecycleEntry[]> {
  const r = await query(
    `SELECT id, action, actor_id, actor_label, reason, metadata, created_at
       FROM review_lifecycle_log
      WHERE review_id = $1
      ORDER BY created_at ASC`,
    [reviewId],
  );
  return r.rows;
}
