// Failed-payment ingestion + lifecycle log + side-effect fan-out.
// Compositional with chargebacks.ts + refunds.ts — same idempotency
// contract, same owner-resolution shape. The lib + log are co-located
// (single file) at this point because the patterns are template now.

import { query } from "@/lib/db";

export interface IngestFailedPaymentArgs {
  stripePaymentIntent: string;
  amountGbp: number;
  currency: string;
  failureCode?: string | null;
  failureMessage?: string | null;
  source: "webhook" | "reconciler" | "admin";
}

export interface IngestFailedPaymentResult {
  created: boolean;
  attemptCount: number;
  userId: string | null;
  orderId: number | null;
}

/**
 * UPSERT — first attempt creates a row, subsequent failures on the
 * same payment_intent bump attempt_count + last_attempt_at. The
 * burst signal pass (Phase C) reads attempt_count.
 */
export async function ingestFailedPayment(args: IngestFailedPaymentArgs): Promise<IngestFailedPaymentResult> {
  const ownerRes = await query(
    `SELECT user_id, id AS order_id FROM customer_orders
      WHERE stripe_payment_intent = $1 LIMIT 1`,
    [args.stripePaymentIntent],
  );
  const userId: string | null = ownerRes.rows[0]?.user_id ?? null;
  const orderId: number | null = ownerRes.rows[0]?.order_id ?? null;

  const r = await query(
    `INSERT INTO failed_payments
       (stripe_payment_intent, user_id, order_id,
        amount_gbp, currency, failure_code, failure_message)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (stripe_payment_intent) DO UPDATE SET
       attempt_count   = failed_payments.attempt_count + 1,
       last_attempt_at = NOW(),
       failure_code    = COALESCE(EXCLUDED.failure_code, failed_payments.failure_code),
       failure_message = COALESCE(EXCLUDED.failure_message, failed_payments.failure_message),
       user_id         = COALESCE(failed_payments.user_id, EXCLUDED.user_id),
       order_id        = COALESCE(failed_payments.order_id, EXCLUDED.order_id),
       updated_at      = NOW()
     RETURNING (xmax = 0) AS created, attempt_count`,
    [
      args.stripePaymentIntent,
      userId,
      orderId,
      args.amountGbp.toFixed(2),
      args.currency,
      args.failureCode ?? null,
      args.failureMessage ?? null,
    ],
  );
  const created: boolean = r.rows[0]?.created ?? false;
  const attemptCount: number = r.rows[0]?.attempt_count ?? 1;

  await logFailedPaymentTransition({
    stripePaymentIntent: args.stripePaymentIntent,
    action: created ? "received" : "retried",
    actorLabel: `system:${args.source}`,
    reason: `${args.failureCode ?? "unknown"}${args.failureMessage ? ` — ${args.failureMessage}` : ""}`,
    metadata: { attempt_count: attemptCount, source: args.source },
  });

  return { created, attemptCount, userId, orderId };
}

/** Lifecycle log — co-located here for compactness. */
type FailedPaymentAction = "received" | "retried" | "burst_checked" | "admin_override";

export async function logFailedPaymentTransition(args: {
  stripePaymentIntent: string;
  action: FailedPaymentAction;
  actorLabel?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown> | null;
}): Promise<void> {
  await query(
    `INSERT INTO failed_payment_lifecycle_log
       (stripe_payment_intent, action, actor_label, reason, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [
      args.stripePaymentIntent,
      args.action,
      args.actorLabel ?? null,
      args.reason ?? null,
      args.metadata ? JSON.stringify(args.metadata) : null,
    ],
  ).catch((err) => {
    console.error(`[failed-payment-log] insert failed (pi=${args.stripePaymentIntent}):`, err);
  });
}

/**
 * Side-effect fan-out: gate via burst_checked column (atomic
 * UPDATE…RETURNING), run the FAILED_PAYMENT_BURST detection pass,
 * stamp lifecycle log. Same one-shot semantics as chargebacks +
 * refunds.
 */
export async function handleFailedPayment(args: { stripePaymentIntent: string; userId: string }): Promise<{ ran: boolean }> {
  const gate = await query(
    `UPDATE failed_payments
        SET burst_checked = true, updated_at = NOW()
      WHERE stripe_payment_intent = $1 AND burst_checked = false
      RETURNING stripe_payment_intent`,
    [args.stripePaymentIntent],
  );
  if (gate.rowCount === 0) return { ran: false };

  const { checkFailedPaymentBurst } = await import("@/lib/fraud/passes");
  await checkFailedPaymentBurst(args.userId).catch((err) =>
    console.error(`[failed-payment] burst check failed for ${args.userId}:`, err),
  );

  void logFailedPaymentTransition({
    stripePaymentIntent: args.stripePaymentIntent,
    action: "burst_checked",
    actorLabel: "system:failed-payment-handler",
    reason: `Burst pattern check fired for user ${args.userId}`,
  });

  return { ran: true };
}
