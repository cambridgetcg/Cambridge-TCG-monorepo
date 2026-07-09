// Append-only swap lifecycle audit log helper.
// Mirrors lib/market/lifecycle-log.ts but takes the query function as a
// parameter so state transitions can write the log INSIDE the same
// transaction() as the status update — the log row and the transition it
// records commit or roll back together.

import type { CompatQueryFn } from "@cambridge-tcg/db/compat";

export type SwapAction =
  | "created"
  | "proposed"
  | "countered"
  | "accepted"
  | "declined"
  | "cancelled"
  | "cancel_requested"
  | "expired"
  | "address_set"
  | "shipping"
  | "shipped"
  | "receipt_confirmed"
  | "completed";

export interface LogSwapArgs {
  swapId: string;
  action: SwapAction;
  actorId?: string | null;
  /** 'proposer' | 'recipient' | 'system' — who pressed (or which sweep ran). */
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logSwapTransition(
  q: CompatQueryFn,
  args: LogSwapArgs,
): Promise<void> {
  await q(
    `INSERT INTO swap_lifecycle_log
       (swap_id, action, actor_id, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [
      args.swapId,
      args.action,
      args.actorId ?? null,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  );
}
