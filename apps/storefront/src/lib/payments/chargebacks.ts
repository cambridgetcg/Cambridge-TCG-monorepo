// Chargeback ingestion lib.
//
// Ingests Stripe charge.dispute.* events (webhook OR daily reconciler)
// into the chargebacks table. Idempotent via stripe_dispute_id PK.
// Phase C wires the post-insert side effects (fraud signal, auto-
// suspend, governance log, trust recompute).

import { query } from "@/lib/db";
import { logChargebackTransition } from "./chargeback-log";

export interface IngestChargebackArgs {
  stripeDisputeId: string;
  stripePaymentIntent: string;
  amountGbp: number;
  currency: string;
  stripeStatus: string;
  stripeReason?: string | null;
  evidenceDueAt?: Date | null;
  /** Where this came from — 'webhook' | 'reconciler' — for audit only. */
  source: "webhook" | "reconciler" | "admin";
}

export interface IngestResult {
  /** True if this is the first time we've seen this dispute id. */
  created: boolean;
  /** True if status changed since the prior version we held. */
  statusChanged: boolean;
  userId: string | null;
  orderId: number | null;
  status: string;
}

/**
 * Insert OR update the chargeback row (PK on stripe_dispute_id makes
 * upsert idempotent). Resolves the owning user via the linked
 * customer_orders row's stripe_payment_intent. Audit log row per
 * call so retries are traceable too.
 */
export async function ingestChargeback(args: IngestChargebackArgs): Promise<IngestResult> {
  // Resolve owner from customer_orders. If there's no matching paid
  // order, user_id stays null and admin investigates manually
  // (chargeback could be on a non-marketplace charge — Stripe Connect
  // donations, prior schema rows, etc).
  const ownerRes = await query(
    `SELECT user_id, id AS order_id
       FROM customer_orders
      WHERE stripe_payment_intent = $1
      LIMIT 1`,
    [args.stripePaymentIntent],
  );
  const userId: string | null = ownerRes.rows[0]?.user_id ?? null;
  const orderId: number | null = ownerRes.rows[0]?.order_id ?? null;

  const beforeRes = await query(
    `SELECT stripe_status FROM chargebacks WHERE stripe_dispute_id = $1`,
    [args.stripeDisputeId],
  );
  const before = beforeRes.rows[0];
  const created = !before;

  await query(
    `INSERT INTO chargebacks
       (stripe_dispute_id, stripe_payment_intent, user_id, order_id,
        amount_gbp, currency, stripe_status, stripe_reason, evidence_due_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (stripe_dispute_id) DO UPDATE SET
       stripe_status   = EXCLUDED.stripe_status,
       stripe_reason   = COALESCE(EXCLUDED.stripe_reason, chargebacks.stripe_reason),
       evidence_due_at = COALESCE(EXCLUDED.evidence_due_at, chargebacks.evidence_due_at),
       user_id         = COALESCE(chargebacks.user_id, EXCLUDED.user_id),
       order_id        = COALESCE(chargebacks.order_id, EXCLUDED.order_id),
       updated_at      = NOW()`,
    [
      args.stripeDisputeId,
      args.stripePaymentIntent,
      userId,
      orderId,
      args.amountGbp.toFixed(2),
      args.currency,
      args.stripeStatus,
      args.stripeReason ?? null,
      args.evidenceDueAt ?? null,
    ],
  );

  const statusChanged = !!before && before.stripe_status !== args.stripeStatus;

  // Lifecycle log: 'received' on first insert, 'status_changed' on
  // subsequent updates.
  void logChargebackTransition({
    stripeDisputeId: args.stripeDisputeId,
    action: created ? "received" : (statusChanged ? "status_changed" : "received"),
    actorLabel: `system:${args.source}`,
    reason: `${args.stripeStatus}${args.stripeReason ? ` (${args.stripeReason})` : ""}`,
    metadata: {
      amount_gbp: args.amountGbp,
      prior_status: before?.stripe_status ?? null,
      source: args.source,
    },
  });

  return {
    created,
    statusChanged,
    userId,
    orderId,
    status: args.stripeStatus,
  };
}
