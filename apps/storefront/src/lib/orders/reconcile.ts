/**
 * Periodic reconciliation: pull recent Stripe checkout sessions and
 * make sure every paid one has a corresponding customer_orders row.
 *
 * Third line of defence behind:
 *   1. Webhook (`checkout.session.completed` → primary)
 *   2. `/order-confirmation` page (defensive backup when the user
 *       returns from Stripe checkout)
 *
 * If both miss (webhook misconfigured + customer closed tab on Stripe's
 * page before redirect), this sweep catches the orphan. Idempotent on
 * stripe_session_id so a same-window webhook + sweep run is a no-op.
 *
 * Designed to be cheap: pulls last LOOKBACK_HOURS of sessions only.
 */

import { getStripe } from "@/lib/stripe";
import { recordOrderFromStripeSession } from "./record";

/** How far back we sweep on each run. 48h gives plenty of headroom for
 * webhooks that get retried over a long window. */
const LOOKBACK_HOURS = 48;

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
