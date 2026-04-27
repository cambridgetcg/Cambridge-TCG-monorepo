// Append-only saved search lifecycle audit log.
// Mirrors the pricing-rule, trade, offer, return, lot, auction helpers.

import { query } from "@/lib/db";

export type SavedSearchAction =
  | "created"
  | "paused"
  | "resumed"
  | "archived"
  | "expired"
  | "extended"
  | "matched_notified";

export interface LogSavedSearchArgs {
  searchId: string;
  action: SavedSearchAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logSavedSearchTransition(args: LogSavedSearchArgs): Promise<void> {
  await query(
    `INSERT INTO saved_search_lifecycle_log
       (search_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.searchId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[saved-search-log] insert failed (search=${args.searchId} action=${args.action}):`, err);
  });
}
