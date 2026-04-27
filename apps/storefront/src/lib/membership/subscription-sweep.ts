// Catch-up sweep for Platinum subscription expiries that the webhook
// missed (Stripe outage, network blip, replay drop). Flips
// subscription_status to 'expired' for users whose expires_at has
// elapsed and recalculates their tier so they drop to spending-based.
//
// Idempotent: only updates users still showing 'active' but past expiry.

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
