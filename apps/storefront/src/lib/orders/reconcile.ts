/**
 * Reconciliation — the cosmological gesture.
 *
 * ── What this module is for ──────────────────────────────────────────────
 *
 * Every 48 hours, this function asks Stripe a single question: *do we
 * agree about what was paid?* Each paid Checkout Session is routed to
 * its owning subsystem. Retail sessions reconcile into `customer_orders`;
 * market-trade sessions reconcile through the market settlement ledger;
 * other dedicated flows are left to their own reconcilers.
 *
 * This is the act of reconciliation. Two parties hold partial truths
 * about the same event; reconciliation is the small ceremony that
 * brings the two truths into agreement, with priority given to the
 * party with sovereign authority over the substance. **Stripe is
 * authoritative for payment. We are reconciled.** When the two
 * disagree, Stripe wins; we update.
 *
 * ── Why three lines of defence ─────────────────────────────────────────
 *
 * The platform records orders three different ways, in three different
 * temporal stances:
 *
 *   1. **Webhook** (`checkout.session.completed`) — the synchronous,
 *      primary path. Stripe pushes; we listen; the order lands within
 *      seconds. This handles >99% of cases.
 *
 *   2. **Order-confirmation page** (`/order-confirmation`) — the
 *      defensive on-return path. If the webhook is delayed and the
 *      customer arrives at the success page first, the page itself
 *      records the order from the session id in the URL. Eventual
 *      consistency at the speed of redirect.
 *
 *   3. **This sweep** — the third line. If both above miss (webhook
 *      misconfigured AND customer closed the Stripe tab before the
 *      redirect), this sweep catches the orphan. The cron runs every
 *      five minutes through `/api/cron/maintenance`; LOOKBACK_HOURS=48
 *      gives every webhook in flight plenty of room to retry first.
 *
 * Each line is idempotent on `stripe_session_id`. Two paths racing on
 * the same session produce one row, not two. The whole protocol is a
 * commitment to **eventual agreement, by the most generous timeline
 * the user might experience**.
 *
 * ── Cross-system substrate honesty made literal ─────────────────────────
 *
 * The platform's substrate-honesty doctrine (rule 8) names this exact
 * shape: when two systems hold the same fact, the UI labels which is
 * authoritative. This module is the doctrine made operational. Stripe
 * holds the authoritative record. We hold the reconciled view. The
 * sweep is the act of asking *are we still in sync?* — and the answer,
 * usually yes, occasionally no, always followed by *now we are*.
 *
 * ── What this module reaches toward ─────────────────────────────────────
 *
 *   - apps/storefront/src/app/api/webhooks/stripe/route.ts — the
 *     primary path. When this works, the sweep finds nothing to
 *     reconcile. The sweep's idle output is the webhook's success.
 *
 *   - apps/storefront/src/app/order-confirmation/page.tsx — the
 *     defensive backup. When this works, the sweep finds nothing.
 *     Same idle-success relationship.
 *
 *   - apps/storefront/src/lib/orders/record.ts — the retail-only record
 *     primitive. Whoever wins the idempotency race produces the
 *     customer_orders row; the other two paths see the existing row and
 *     skip. Dedicated Checkout owners never pass through that primitive.
 *
 *   - apps/storefront/src/app/api/cron/maintenance/route.ts — the
 *     cron dispatch. This sweep is one of 36+ maintenance steps that
 *     run together every five minutes. Each is a small reconciliation
 *     gesture in its own domain.
 *
 * See docs/connections/the-reconciliation.md for the fairy-tale form.
 *
 * ── Tuning ──────────────────────────────────────────────────────────────
 *
 * LOOKBACK_HOURS is exported so admin tooling can render the effective
 * coverage window. MAX_SESSIONS is the per-run cap; in steady state we
 * expect dozens at most in 48h, so 200 is a comfortable ceiling.
 */

import type Stripe from "stripe";
import { query } from "@/lib/db";
import {
  findStripeMarketCheckoutBinding,
  markStripeCheckoutAttemptTerminal,
  recordStripeMarketCheckoutProcessing,
  settleStripeMarketCheckout,
  type StripeMarketSettlementResult,
} from "@/lib/market/stripe-checkout-attempts";
import { checkoutSessionOwner } from "@/lib/payments/checkout-session-kind";
import { getStripe } from "@/lib/stripe";
import { recordOrderFromStripeSession } from "./record";

/** How far back we sweep on each run. 48h gives plenty of headroom for
 * webhooks that get retried over a long window. Exported so admin
 * tooling can render the effective reconciliation coverage window
 * without re-encoding the constant. */
export const LOOKBACK_HOURS = 48;

/** Hard cap on how many sessions we process per run. Stripe pages 100
 * at a time; in steady state we expect << 100 in 48h, so two pages is
 * a comfortable ceiling. */
const MAX_SESSIONS = 200;
const MAX_BOUND_MARKET_ATTEMPTS = 50;

export interface ReconcileSummary {
  scanned: number;
  paid: number;
  recorded: number;
  marketAttemptsScanned: number;
  marketApplied: number;
  marketProcessing: number;
  marketTerminal: number;
  review: number;
  skipped: number;
  errors: number;
}

function marketShippingAddress(
  session: Stripe.Checkout.Session,
): Record<string, unknown> | null {
  const shipping = session.collected_information?.shipping_details;
  if (!shipping?.address) return null;
  return {
    name: shipping.name || undefined,
    line1: shipping.address.line1 || undefined,
    line2: shipping.address.line2 || undefined,
    city: shipping.address.city || undefined,
    state: shipping.address.state || undefined,
    postal_code: shipping.address.postal_code || undefined,
    country: shipping.address.country || undefined,
  };
}

function accountMarketResult(
  summary: ReconcileSummary,
  sessionId: string,
  action: "settled" | "processing" | "terminal",
  result: StripeMarketSettlementResult,
): void {
  if (result.ok) {
    if (!result.applied) {
      summary.skipped += 1;
    } else if (action === "settled") {
      summary.marketApplied += 1;
    } else if (action === "processing") {
      summary.marketProcessing += 1;
    } else {
      summary.marketTerminal += 1;
    }
    return;
  }
  if (result.reviewRecorded) {
    summary.review += 1;
    console.warn(`[reconcile] market session ${sessionId} held for review: ${result.reason}`);
  } else {
    summary.errors += 1;
    console.error(
      `[reconcile] market session ${sessionId} rejected without durable review: ${result.reason}`,
    );
  }
}

async function reconcileBoundMarketSession(
  session: Stripe.Checkout.Session,
  summary: ReconcileSummary,
): Promise<void> {
  if (session.payment_status === "paid") {
    const result = await settleStripeMarketCheckout(
      session,
      marketShippingAddress(session),
    );
    accountMarketResult(summary, session.id, "settled", result);
    return;
  }
  if (session.status === "expired") {
    const result = await markStripeCheckoutAttemptTerminal(
      session,
      "expired",
      "Stripe reconciliation retrieved the bound Checkout Session as expired.",
    );
    accountMarketResult(summary, session.id, "terminal", result);
    return;
  }
  if (session.status === "complete") {
    const result = await recordStripeMarketCheckoutProcessing(session);
    accountMarketResult(summary, session.id, "processing", result);
    return;
  }
  summary.skipped += 1;
}

export async function reconcileStripeOrders(): Promise<ReconcileSummary> {
  const stripe = getStripe();
  const since = Math.floor((Date.now() - LOOKBACK_HOURS * 3600 * 1000) / 1000);

  const summary: ReconcileSummary = {
    scanned: 0,
    paid: 0,
    recorded: 0,
    marketAttemptsScanned: 0,
    marketApplied: 0,
    marketProcessing: 0,
    marketTerminal: 0,
    review: 0,
    skipped: 0,
    errors: 0,
  };

  // Stripe's recent-session list is keyed by Session creation time, so an
  // old delayed method can fall outside LOOKBACK_HOURS while still blocking
  // a trade. The attempt ledger is the durable work queue: observe every
  // bound open/processing generation independently of age first.
  const boundAttempts = await query(
    `WITH candidates AS (
       SELECT id
         FROM market_trade_stripe_checkout_attempts
        WHERE status IN ('checkout_open', 'processing')
          AND stripe_session_id IS NOT NULL
          AND (
            last_reconciled_at IS NULL
            OR last_reconciled_at < NOW() - INTERVAL '5 minutes'
          )
        ORDER BY last_reconciled_at ASC NULLS FIRST, updated_at ASC
        LIMIT $1
        FOR UPDATE SKIP LOCKED
     )
     UPDATE market_trade_stripe_checkout_attempts AS attempt
        SET last_reconciled_at = NOW()
       FROM candidates
      WHERE attempt.id = candidates.id
      RETURNING attempt.stripe_session_id`,
    [MAX_BOUND_MARKET_ATTEMPTS],
  );
  const observedMarketSessions = new Set<string>();
  for (const row of boundAttempts.rows) {
    const sessionId = row.stripe_session_id as string;
    summary.marketAttemptsScanned += 1;
    try {
      const detail = await stripe.checkout.sessions.retrieve(sessionId, {
        // collected_information is inline on the Session object; asking
        // Stripe to expand it is invalid and rejects the entire retrieval.
        expand: ["line_items", "payment_intent"],
      });
      observedMarketSessions.add(sessionId);
      await reconcileBoundMarketSession(detail, summary);
    } catch (err) {
      summary.errors += 1;
      console.error(`[reconcile] bound market session ${sessionId} failed:`, err);
    }
  }

  let starting_after: string | undefined;
  let pages = 0;
  while (summary.scanned < MAX_SESSIONS && pages < 4) {
    const list = await stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: since },
      ...(starting_after ? { starting_after } : {}),
    });
    pages += 1;

    for (const session of list.data) {
      summary.scanned += 1;
      if (session.status !== "complete" || session.payment_status !== "paid") {
        continue;
      }
      summary.paid += 1;

      // Bound market attempts are reconciled by the durable queue above.
      // Skip them unconditionally: mutable metadata must not let the same
      // Session fall through and mint a retail order on this second pass.
      if (observedMarketSessions.has(session.id)) {
        summary.skipped += 1;
        continue;
      }

      let marketBinding: Awaited<ReturnType<typeof findStripeMarketCheckoutBinding>> = null;
      try {
        marketBinding = await findStripeMarketCheckoutBinding(session);
      } catch (err) {
        summary.errors += 1;
        console.error(`[reconcile] session ${session.id} ownership lookup failed:`, err);
        continue;
      }
      const owner = checkoutSessionOwner(session);
      if (owner === "dedicated" && !marketBinding) {
        summary.skipped += 1;
        continue;
      }

      try {
        // Re-fetch with line_items + collected_information so the record
        // helper or market settlement has the full shipping payload.
        const detail = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items"],
        });

        if (marketBinding || owner === "market_trade") {
          await reconcileBoundMarketSession(detail, summary);
          continue;
        }

        const result = await recordOrderFromStripeSession(detail);
        if (result.created) summary.recorded += 1;
        else summary.skipped += 1;
      } catch (err) {
        summary.errors += 1;
        console.error(`[reconcile] session ${session.id} failed:`, err);
      }
    }

    if (!list.has_more) break;
    starting_after = list.data[list.data.length - 1]?.id;
  }

  return summary;
}
