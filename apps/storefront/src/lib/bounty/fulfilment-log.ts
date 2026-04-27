// Append-only audit log for vault item lifecycle transitions.
//
// Originally scoped to fulfilment (reserved → redeemed). After
// migration 0057 it records every status change a vault item undergoes
// — sold_back, expired, gifted, undone, etc — so we have a complete
// provenance trail for support, refunds, and compensating-spend
// rollback paths.
//
// Used to (a) answer support tickets ("when did this expire?") and
// (b) gate the 30-minute admin undo affordance for fulfilment.

import { query } from "@/lib/db";

export const UNDO_WINDOW_SECONDS = 30 * 60;

/** Fulfilment-specific actions, kept narrow for the undo eligibility check. */
export type FulfilmentAction = "fulfilled" | "undone" | "errored";

/** All recognised lifecycle actions. New ones can be added freely — the
 *  underlying column has no CHECK constraint. */
export type LifecycleAction =
  | FulfilmentAction
  | "sold_back"
  | "sold_back_failed"
  | "expired"
  | "expired_credit_failed"
  | "gifted"
  | "traded"
  | "compensation_reverted";

export interface LogFulfilmentArgs {
  vaultItemId: string;
  orderId: number | null;
  action: FulfilmentAction;
  notes?: string | null;
}

export async function logFulfilment(args: LogFulfilmentArgs): Promise<void> {
  await logVaultTransition({
    vaultItemId: args.vaultItemId,
    orderId: args.orderId,
    action: args.action,
    priorStatus: args.action === "fulfilled" ? "reserved" : null,
    notes: args.notes,
  });
}

export interface LogTransitionArgs {
  vaultItemId: string;
  orderId?: number | null;
  action: LifecycleAction;
  priorStatus?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
}

/** Generic lifecycle log writer — best-effort, never throws. */
export async function logVaultTransition(args: LogTransitionArgs): Promise<void> {
  await query(
    `INSERT INTO vault_fulfilment_log
       (vault_item_id, order_id, action, prior_status, notes, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      args.vaultItemId,
      args.orderId ?? null,
      args.action,
      args.priorStatus ?? null,
      args.notes ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(
      `[vault-log] insert failed (item=${args.vaultItemId}, action=${args.action}):`,
      err,
    );
  });
}

export interface LifecycleEntry {
  id: number;
  action: LifecycleAction;
  priorStatus: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  orderId: number | null;
}

/** Fetch the full transition history for a single vault item, oldest first. */
export async function getVaultLifecycle(vaultItemId: string): Promise<LifecycleEntry[]> {
  const r = await query(
    `SELECT id, action, prior_status, notes, metadata, created_at, order_id
       FROM vault_fulfilment_log
      WHERE vault_item_id = $1
      ORDER BY created_at ASC`,
    [vaultItemId],
  );
  return r.rows.map((row) => ({
    id: row.id,
    action: row.action,
    priorStatus: row.prior_status,
    notes: row.notes,
    metadata: row.metadata,
    createdAt: new Date(row.created_at),
    orderId: row.order_id,
  }));
}

export interface UndoEligibility {
  eligible: boolean;
  reason?: string;
  fulfilledAt?: Date;
  ageSeconds?: number;
}

/** Most-recent fulfilled-event lookup for a vault item, gated by the undo window. */
export async function checkUndoEligibility(vaultItemId: string): Promise<UndoEligibility> {
  const r = await query(
    `SELECT created_at FROM vault_fulfilment_log
       WHERE vault_item_id = $1 AND action = 'fulfilled'
       ORDER BY created_at DESC LIMIT 1`,
    [vaultItemId],
  );
  if (r.rows.length === 0) {
    return { eligible: false, reason: "No fulfilment log entry found." };
  }
  const fulfilledAt = new Date(r.rows[0].created_at);
  const ageSeconds = Math.floor((Date.now() - fulfilledAt.getTime()) / 1000);
  if (ageSeconds > UNDO_WINDOW_SECONDS) {
    return {
      eligible: false,
      reason: `Undo window expired (fulfilled ${Math.floor(ageSeconds / 60)} min ago).`,
      fulfilledAt,
      ageSeconds,
    };
  }
  return { eligible: true, fulfilledAt, ageSeconds };
}
