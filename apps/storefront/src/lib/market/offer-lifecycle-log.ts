// Append-only market offer lifecycle audit log.
// Mirrors trade/auction lifecycle helpers exactly.

import { query } from "@/lib/db";

export type OfferAction =
  | "created"
  | "countered"
  | "accepted"
  | "accepted_counter"
  | "declined"
  | "withdrawn"
  | "expired"
  | "admin_override";

export interface LogOfferArgs {
  offerId: string;
  action: OfferAction;
  actorId?: string | null;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logOfferTransition(args: LogOfferArgs): Promise<void> {
  await query(
    `INSERT INTO market_offer_lifecycle_log
       (offer_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.offerId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[offer-log] insert failed (offer=${args.offerId} action=${args.action}):`, err);
  });
}
