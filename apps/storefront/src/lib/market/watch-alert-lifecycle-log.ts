// Append-only watch + price-alert lifecycle audit log.
// One table covers both subject kinds (watches are SKU-keyed, alerts
// are UUID-keyed) so the journey aggregator can render a user's full
// alert history with one query.

import { query } from "@/lib/db";

export type WatchAlertAction =
  | "watch_added"
  | "watch_removed"
  | "alert_created"
  | "alert_deleted"
  | "alert_fired"
  | "alert_throttled";

export interface LogWatchAlertArgs {
  userId: string;
  subjectKind: "watch" | "alert";
  alertId?: string | null;
  sku?: string | null;
  action: WatchAlertAction;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logWatchAlertTransition(args: LogWatchAlertArgs): Promise<void> {
  await query(
    `INSERT INTO watch_alert_lifecycle_log
       (user_id, subject_kind, alert_id, sku, action, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      args.userId,
      args.subjectKind,
      args.alertId ?? null,
      args.sku ?? null,
      args.action,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[watch-alert-log] insert failed (user=${args.userId} action=${args.action}):`, err);
  });
}
