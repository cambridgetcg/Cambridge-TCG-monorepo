/**
 * Subscription expiry sweep — the safety net for the cancel story.
 *
 * ── What this exists to catch ────────────────────────────────────────────
 *
 * The happy path for a cancelled Platinum sub: user POSTs /api/membership/cancel,
 * Stripe schedules cancel_at_period_end, the period elapses, Stripe fires
 * `customer.subscription.deleted`, our webhook handler receives it and
 * clears subscription_status, the next recalculateTier finds no paid tier
 * and demotes the user to their spend-based tier. Three systems coordinate
 * cleanly.
 *
 * The unhappy paths this sweep covers:
 *   - Stripe had a brief outage and dropped the deletion webhook.
 *   - Our webhook endpoint was down for the minute that delivery retried.
 *   - The webhook signature failed verification once and Stripe gave up.
 *   - The user paid by ACH and the sub expired before the receipt cleared.
 *   - We accidentally returned 500 from the webhook and Stripe stopped
 *     retrying after N attempts.
 *
 * In each case, our mirror (`subscription_status = 'active'`) is wrong —
 * we still think they're paying, but the period boundary has passed. They
 * keep collecting Platinum perks (cashback, points multiplier, lower P2P
 * commission) without paying for them. Every hour we don't catch this
 * costs us margin.
 *
 * This sweep is the substrate doing its own audit. It runs nightly,
 * finds rows where `subscription_expires_at < NOW()` AND
 * `subscription_status = 'active'` (the impossible state), flips them to
 * 'expired', and triggers a tier recalculation so the demotion lands.
 *
 * ── The cancel/sweep duet ────────────────────────────────────────────────
 *
 *   user gesture        → cancelSubscription()        → Stripe scheduled
 *   period elapses      → Stripe webhook              → our mirror updates
 *                                                       (happy path)
 *   webhook missed      → THIS SWEEP                  → our mirror updates
 *                                                       (eventual consistency)
 *
 * Idempotent. Only touches rows in the impossible state. If the webhook
 * eventually arrives after the sweep already ran, the webhook is a no-op
 * because the row is already 'expired'.
 *
 * ── Where this meets the rest of the platform ────────────────────────────
 *
 *   /api/cron/maintenance   the cron dispatch that calls this sweep
 *   recalculateTier         our re-resolution of the tier ladder
 *                           (Priority 1 paid → Priority 2 spend)
 *   webhook handler         /api/webhooks/stripe — the primary path
 *                           we're insuring against
 *   cron_runs               (proposed in kingdom-042) — when this sweep
 *                           runs, log the (expired, recalculated, failures)
 *                           tuple as a row so /system/cron can show whether
 *                           it's been firing and how much work it's been
 *                           catching. A sweep that suddenly catches 50
 *                           expiries means the webhook has been broken.
 *                           Today, that signal is invisible.
 *
 * Idempotent: only updates users still showing 'active' but past expiry.
 */

import { query } from "@/lib/db";
import { recalculateTier } from "./db";

export interface SubscriptionSweepResult {
  expired: number;
  recalculated: number;
  failures: number;
}

export async function runSubscriptionExpirySweep(): Promise<SubscriptionSweepResult> {
  const result = await query(
    `UPDATE users
        SET subscription_status = 'expired',
            tier_calculated_at  = NOW(),
            updated_at          = NOW()
      WHERE subscription_status = 'active'
        AND subscription_expires_at IS NOT NULL
        AND subscription_expires_at <= NOW()
      RETURNING id`
  );
  let recalculated = 0;
  let failures = 0;
  for (const row of result.rows) {
    try {
      await recalculateTier(row.id);
      recalculated++;
    } catch (err) {
      failures++;
      console.error(`[subscription-sweep] recalc failed for ${row.id}:`, err);
    }
  }
  return { expired: result.rows.length, recalculated, failures };
}
