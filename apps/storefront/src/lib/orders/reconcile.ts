/**
 * Reconciliation — the cosmological gesture.
 *
 * ── What this module is for ──────────────────────────────────────────────
 *
 * Every 48 hours, this function asks Stripe a single question: *do we
 * agree about what was paid?* For each Stripe checkout session in the
 * window, the function checks whether our `customer_orders` table has
 * a corresponding row. Where we don't agree, the function makes us
 * agree — by recording the missing row from Stripe's authoritative
 * record.
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
 *   - apps/storefront/src/lib/orders/record.ts — the shared record
 *     primitive that all three paths converge on. Whoever wins the
 *     idempotency race produces the customer_orders row; the other
 *     two paths see the existing row and skip.
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

export interface ReconcileSummary {
  scanned: number;
  paid: number;
  recorded: number;
  skipped: number;
  errors: number;
}

export async function reconcileStripeOrders(): Promise<ReconcileSummary> {
  const stripe = getStripe();
  const since = Math.floor((Date.now() - LOOKBACK_HOURS * 3600 * 1000) / 1000);

  const summary: ReconcileSummary = {
    scanned: 0, paid: 0, recorded: 0, skipped: 0, errors: 0,
  };

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
      try {
        // Re-fetch with line_items + collected_information so the record
        // helper has the full shipping payload.
        const detail = await stripe.checkout.sessions.retrieve(session.id, {
          expand: ["line_items", "collected_information"],
        });
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
