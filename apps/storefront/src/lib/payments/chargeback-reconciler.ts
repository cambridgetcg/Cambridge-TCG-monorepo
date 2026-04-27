// Daily Stripe-poll reconciliation for chargebacks.
//
// Webhook delivery is at-least-once but NOT guaranteed: Stripe may
// drop deliveries during outages, our handler may 5xx (despite
// best-effort 200-on-error in Phase B), or signature validation
// may fail post-secret-rotation. The reconciler polls Stripe's
// disputes list endpoint daily and ingestChargeback's idempotency
// catches anything we missed.
//
// Self-gates to 06:00 UTC so it runs after all the other reputation
// + fraud sweeps but well before customer-facing morning hours.

import { query } from "@/lib/db";
import { ingestChargeback } from "./chargebacks";
import { handleNewChargeback } from "./chargeback-effects";
import { ingestRefund } from "./refunds";
import { handleRefundReceived } from "./refund-effects";
import { ingestFailedPayment, handleFailedPayment } from "./failed-payments";

const UTC_HOUR_WINDOW = 6;
const UTC_MINUTE_WINDOW_START = 0;
const UTC_MINUTE_WINDOW_END = 2;

const POLL_LOOKBACK_DAYS = 14;
const PAGE_SIZE = 100;

export interface ReconcileResult {
  ranInWindow: boolean;
  fetched: number;
  newlyIngested: number;
  statusChanged: number;
  failures: number;
  refundsFetched?: number;
  refundsNewlyIngested?: number;
  failedFetched?: number;
  failedNewlyIngested?: number;
}

function inWindow(): boolean {
  const now = new Date();
  return now.getUTCHours() === UTC_HOUR_WINDOW
    && now.getUTCMinutes() >= UTC_MINUTE_WINDOW_START
    && now.getUTCMinutes() <  UTC_MINUTE_WINDOW_END;
}

export async function runChargebackReconciler(opts?: { force?: boolean }): Promise<ReconcileResult> {
  if (!opts?.force && !inWindow()) {
    return { ranInWindow: false, fetched: 0, newlyIngested: 0, statusChanged: 0, failures: 0 };
  }

  const result: ReconcileResult = {
    ranInWindow: true,
    fetched: 0,
    newlyIngested: 0,
    statusChanged: 0,
    failures: 0,
  };

  const stripeKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!stripeKey || !stripeKey.startsWith("sk_")) {
    console.warn("[chargeback-reconciler] STRIPE_SECRET_KEY not configured — skipping");
    return result;
  }

  // Lazy import — Stripe SDK is heavy, no point loading on cron ticks
  // outside the window.
  const { default: Stripe } = await import("stripe");
  const stripe = new Stripe(stripeKey);

  const lookbackUnix = Math.floor((Date.now() - POLL_LOOKBACK_DAYS * 86_400_000) / 1000);

  // Walk the disputes list using Stripe's auto-pagination wrapper.
  // Cap iterations defensively so a runaway list doesn't blow the
  // cron budget.
  let pageCount = 0;
  const MAX_PAGES = 10;

  try {
    for await (const dispute of stripe.disputes.list({
      created: { gte: lookbackUnix },
      limit: PAGE_SIZE,
    })) {
      result.fetched++;
      try {
        const ingestResult = await ingestChargeback({
          stripeDisputeId: dispute.id,
          stripePaymentIntent: typeof dispute.payment_intent === "string"
            ? dispute.payment_intent
            : dispute.payment_intent?.id ?? "",
          amountGbp: (dispute.amount ?? 0) / 100,
          currency: dispute.currency ?? "gbp",
          stripeStatus: dispute.status,
          stripeReason: dispute.reason ?? null,
          evidenceDueAt: dispute.evidence_details?.due_by
            ? new Date(dispute.evidence_details.due_by * 1000)
            : null,
          source: "reconciler",
        });
        if (ingestResult.created) result.newlyIngested++;
        if (ingestResult.statusChanged) result.statusChanged++;

        // Same one-shot side effects as the webhook path. The
        // fraud_emitted gate inside handleNewChargeback no-ops if
        // the webhook already fired the cascade.
        if (ingestResult.userId) {
          await handleNewChargeback({
            stripeDisputeId: dispute.id,
            userId: ingestResult.userId,
            amountGbp: (dispute.amount ?? 0) / 100,
            stripeReason: dispute.reason ?? null,
          }).catch((err) => console.error(`[reconciler] effects failed for ${dispute.id}:`, err));
        }
      } catch (err) {
        result.failures++;
        console.error(`[chargeback-reconciler] ingest failed for ${dispute.id}:`, err);
      }

      pageCount++;
      if (pageCount >= MAX_PAGES * PAGE_SIZE) break;
    }
  } catch (err) {
    console.error("[chargeback-reconciler] Stripe list failed:", err);
  }

  // ── Refunds: same shape, same Stripe client, same idempotency ──
  let refundsFetched = 0;
  let refundsNew = 0;
  try {
    let refundPageCount = 0;
    for await (const refund of stripe.refunds.list({
      created: { gte: lookbackUnix },
      limit: PAGE_SIZE,
    })) {
      refundsFetched++;
      try {
        const piId = typeof refund.payment_intent === "string"
          ? refund.payment_intent
          : refund.payment_intent?.id ?? "";
        const ingestResult = await ingestRefund({
          stripeRefundId: refund.id,
          stripePaymentIntent: piId,
          stripeCharge: typeof refund.charge === "string"
            ? refund.charge
            : refund.charge?.id ?? null,
          amountGbp: (refund.amount ?? 0) / 100,
          currency: refund.currency ?? "gbp",
          stripeStatus: refund.status ?? "pending",
          stripeReason: refund.reason ?? null,
          initiatedBy: "stripe",
          source: "reconciler",
        });
        if (ingestResult.created) refundsNew++;

        if (ingestResult.created && ingestResult.userId && refund.status === "succeeded") {
          await handleRefundReceived({
            stripeRefundId: refund.id,
            userId: ingestResult.userId,
            amountGbp: (refund.amount ?? 0) / 100,
          }).catch((err) => console.error(`[reconciler] refund effects failed for ${refund.id}:`, err));
        }
      } catch (err) {
        result.failures++;
        console.error(`[chargeback-reconciler] refund ingest failed for ${refund.id}:`, err);
      }

      refundPageCount++;
      if (refundPageCount >= MAX_PAGES * PAGE_SIZE) break;
    }
  } catch (err) {
    console.error("[chargeback-reconciler] Stripe refunds list failed:", err);
  }
  result.refundsFetched = refundsFetched;
  result.refundsNewlyIngested = refundsNew;

  // ── Failed payments: third leg of the cluster ──
  let failedFetched = 0;
  let failedNew = 0;
  try {
    let pageCount = 0;
    for await (const pi of stripe.paymentIntents.list({
      created: { gte: lookbackUnix },
      limit: PAGE_SIZE,
    })) {
      // Stripe doesn't have a status filter for failed-only; we
      // post-filter and skip non-failed PIs.
      if (pi.status !== "requires_payment_method" && pi.status !== "canceled") {
        continue;
      }
      // requires_payment_method with last_payment_error is the
      // canonical "failed and waiting" shape; canceled with an
      // earlier failure also counts.
      if (!pi.last_payment_error) {
        continue;
      }
      failedFetched++;
      try {
        const ingestResult = await ingestFailedPayment({
          stripePaymentIntent: pi.id,
          amountGbp: (pi.amount ?? 0) / 100,
          currency: pi.currency ?? "gbp",
          failureCode: pi.last_payment_error.code ?? null,
          failureMessage: pi.last_payment_error.message ?? null,
          source: "reconciler",
        });
        if (ingestResult.created) failedNew++;
        if (ingestResult.userId) {
          await handleFailedPayment({
            stripePaymentIntent: pi.id,
            userId: ingestResult.userId,
          }).catch(() => { /* logged inside */ });
        }
      } catch (err) {
        result.failures++;
        console.error(`[reconciler] failed-payment ingest failed for ${pi.id}:`, err);
      }
      pageCount++;
      if (pageCount >= MAX_PAGES * PAGE_SIZE) break;
    }
  } catch (err) {
    console.error("[chargeback-reconciler] Stripe payment_intents list failed:", err);
  }
  result.failedFetched = failedFetched;
  result.failedNewlyIngested = failedNew;

  // Also touch the local lifecycle log so /admin/governance shows the
  // reconciler ran even when it found nothing — useful for "did the
  // cron run yesterday?" debugging.
  if (result.fetched > 0 || result.newlyIngested > 0) {
    await query(
      `INSERT INTO admin_actions_log (actor_label, target_kind, action, reason, metadata)
       VALUES ('system:chargeback-reconciler', 'system', 'system.cron_run', $1, $2::jsonb)`,
      [
        `Reconciled ${result.fetched} disputes (${result.newlyIngested} new, ${result.statusChanged} updated)`,
        JSON.stringify(result),
      ],
    ).catch(() => { /* best-effort */ });
  }

  return result;
}
