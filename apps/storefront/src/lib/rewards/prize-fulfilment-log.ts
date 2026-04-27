// Append-only prize fulfilment lifecycle log.
//
// Parallels @/lib/bounty/fulfilment-log for vault redemptions. Every
// admin transition on a physical prize (raffle / mystery_box / pack)
// writes a row so support has the full provenance trail — when it was
// shipped, which carrier + tracking, whether it got undone, why.
//
// Also gates the 30-minute admin undo window: undo only permitted if
// the most recent 'shipped' event is still within the window.

import { query } from "@/lib/db";

export const UNDO_WINDOW_SECONDS = 30 * 60;

export type PrizeKind = "raffle" | "mystery_box" | "pack";
export type PrizeLifecycleAction =
  | "shipped"
  | "undone"
  | "errored"
  | "address_updated"
  | "tracking_updated";

export interface LogPrizeArgs {
  prizeKind: PrizeKind;
  prizeId: string;
  userId?: string | null;
  action: PrizeLifecycleAction;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Best-effort: a logging failure must not block the shipping action. */
export async function logPrizeTransition(args: LogPrizeArgs): Promise<void> {
  await query(
    `INSERT INTO prize_fulfilment_log
       (prize_kind, prize_id, user_id, action, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.prizeKind,
      args.prizeId,
      args.userId ?? null,
      args.action,
      args.notes ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(
      `[prize-log] insert failed (${args.prizeKind}:${args.prizeId} action=${args.action}):`,
      err,
    );
  });
}

export interface UndoEligibility {
  eligible: boolean;
  reason?: string;
  shippedAt?: Date;
  ageSeconds?: number;
}

export async function checkPrizeUndoEligibility(
  prizeKind: PrizeKind,
  prizeId: string,
): Promise<UndoEligibility> {
  const r = await query(
    `SELECT created_at FROM prize_fulfilment_log
       WHERE prize_kind = $1 AND prize_id = $2 AND action = 'shipped'
       ORDER BY created_at DESC LIMIT 1`,
    [prizeKind, prizeId],
  );
  if (r.rows.length === 0) {
    return { eligible: false, reason: "No ship event logged." };
  }
  const shippedAt = new Date(r.rows[0].created_at);
  const ageSeconds = Math.floor((Date.now() - shippedAt.getTime()) / 1000);
  if (ageSeconds > UNDO_WINDOW_SECONDS) {
    return {
      eligible: false,
      reason: `Undo window expired (shipped ${Math.floor(ageSeconds / 60)} min ago).`,
      shippedAt,
      ageSeconds,
    };
  }
  return { eligible: true, shippedAt, ageSeconds };
}

export interface LifecycleEntry {
  id: number;
  action: PrizeLifecycleAction;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

export async function getPrizeLifecycle(
  prizeKind: PrizeKind,
  prizeId: string,
): Promise<LifecycleEntry[]> {
  const r = await query(
    `SELECT id, action, notes, metadata, created_at
       FROM prize_fulfilment_log
      WHERE prize_kind = $1 AND prize_id = $2
      ORDER BY created_at ASC`,
    [prizeKind, prizeId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    action: row.action,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
  }));
}
