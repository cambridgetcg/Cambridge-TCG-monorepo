// Trade-in maintenance — runs from /api/cron/maintenance every minute.
// Currently: expire quoted submissions past their 24h response window and
// fan out the "quote expired" email to each affected customer.

import { sweepExpiredQuotes } from "./db";
import { sendTradeinStatusEmail } from "./email";

export interface TradeinSweepResult {
  expired: number;
  emailsSent: number;
  emailsFailed: number;
}

export async function runTradeinSweep(): Promise<TradeinSweepResult> {
  const { expired } = await sweepExpiredQuotes();
  let emailsSent = 0;
  let emailsFailed = 0;

  for (const row of expired) {
    try {
      await sendTradeinStatusEmail({
        email: row.customer_email,
        reference: row.reference,
        status: "expired",
      });
      emailsSent++;
    } catch (err) {
      console.error(`[tradein] expired-email to ${row.customer_email} failed:`, err);
      emailsFailed++;
    }
  }

  return { expired: expired.length, emailsSent, emailsFailed };
}
