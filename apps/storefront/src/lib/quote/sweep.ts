// Quote maintenance — runs from /api/cron/maintenance. Expires stale
// 'quoted' rows past their offer_expires_at and fans out the "expired"
// email to each affected customer. Same shape as runTradeinSweep so the
// cron fan-out can treat them symmetrically.

import { sweepExpiredQuoteOffers } from "./db";
import { sendQuoteStatusEmail } from "./email";

export interface QuoteSweepResult {
  expired: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function runQuoteSweep(): Promise<QuoteSweepResult> {
  const { expired } = await sweepExpiredQuoteOffers();
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const row of expired) {
    try {
      await sendQuoteStatusEmail({
        email: row.customer_email,
        reference: row.reference,
        status: "expired",
      });
      emailsSent++;
    } catch (err) {
      console.error(`[quote] expired-email to ${row.customer_email} failed:`, err);
      emailsFailed++;
    }
  }

  return { expired: expired.length, emailsSent, emailsFailed };
}
