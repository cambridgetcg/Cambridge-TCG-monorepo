// Refund ingestion lib — parallel to @/lib/payments/chargebacks.
// Same idempotency contract (stripe_refund_id PK), same owner
// resolution via customer_orders.stripe_payment_intent join, same
// fan-out gate (abuse_checked) for upcoming Phase C.

import { query } from "@/lib/db";
import { logRefundTransition } from "./refund-log";

export interface IngestRefundArgs {
  stripeRefundId: string;
  stripePaymentIntent: string;
  stripeCharge?: string | null;
  amountGbp: number;
  currency: string;
  stripeStatus: string;
  stripeReason?: string | null;
  initiatedBy?: "admin" | "system" | "stripe";
  source: "webhook" | "reconciler" | "admin";
}

export interface IngestRefundResult {
  created: boolean;
  statusChanged: boolean;
  userId: string | null;
  orderId: number | null;
  status: string;
}

export async function ingestRefund(args: IngestRefundArgs): Promise<IngestRefundResult> {
  const ownerRes = await query(
    `SELECT user_id, id AS order_id FROM customer_orders
      WHERE stripe_payment_intent = $1 LIMIT 1`,
    [args.stripePaymentIntent],
  );
  const userId: string | null = ownerRes.rows[0]?.user_id ?? null;
  const orderId: number | null = ownerRes.rows[0]?.order_id ?? null;

  const beforeRes = await query(
    `SELECT stripe_status FROM refunds WHERE stripe_refund_id = $1`,
    [args.stripeRefundId],
  );
  const before = beforeRes.rows[0];
  const created = !before;

  await query(
    `INSERT INTO refunds
       (stripe_refund_id, stripe_payment_intent, stripe_charge, user_id, order_id,
        amount_gbp, currency, stripe_status, stripe_reason, initiated_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (stripe_refund_id) DO UPDATE SET
       stripe_status   = EXCLUDED.stripe_status,
       stripe_reason   = COALESCE(EXCLUDED.stripe_reason, refunds.stripe_reason),
       user_id         = COALESCE(refunds.user_id, EXCLUDED.user_id),
       order_id        = COALESCE(refunds.order_id, EXCLUDED.order_id),
       updated_at      = NOW()`,
    [
      args.stripeRefundId,
      args.stripePaymentIntent,
      args.stripeCharge ?? null,
      userId,
      orderId,
      args.amountGbp.toFixed(2),
      args.currency,
      args.stripeStatus,
      args.stripeReason ?? null,
      args.initiatedBy ?? "stripe",
    ],
  );

  const statusChanged = !!before && before.stripe_status !== args.stripeStatus;

  void logRefundTransition({
    stripeRefundId: args.stripeRefundId,
    action: created ? "received" : (statusChanged ? "status_changed" : "received"),
    actorLabel: `system:${args.source}`,
    reason: `${args.stripeStatus}${args.stripeReason ? ` (${args.stripeReason})` : ""}`,
    metadata: {
      amount_gbp: args.amountGbp,
      prior_status: before?.stripe_status ?? null,
      source: args.source,
      initiated_by: args.initiatedBy ?? "stripe",
    },
  });

  return { created, statusChanged, userId, orderId, status: args.stripeStatus };
}
