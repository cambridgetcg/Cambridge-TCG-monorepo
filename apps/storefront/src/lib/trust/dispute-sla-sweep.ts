// Dispute SLA maintenance — runs from /api/cron/maintenance. Auto-escalates
// disputes that have sat in 'open' past their response window (the trade's
// dispute_window_hours, default 72h) with no admin triage. Same shape as
// runQuoteSweep / runPayoutSweep so the cron fan-out treats it symmetrically.
//
// SAFETY: this NEVER moves money. It only flips 'open' → 'escalated', which
// surfaces the dispute in the admin priority queue (the admin overview counts
// `status IN ('open','escalated')`). A human still resolves every dispute via
// resolveDispute() — the sweep just makes sure nothing rots silently past SLA.

import { escalateStaleDisputes } from "@/lib/trust/db";

export interface DisputeSlaSweepResult {
  escalated: number;
  /** Hours the oldest escalated dispute had been open. 0 when none escalated. */
  oldestHoursOpen: number;
}

export async function runDisputeSlaSweep(): Promise<DisputeSlaSweepResult> {
  const { escalated } = await escalateStaleDisputes();

  let oldestHoursOpen = 0;
  for (const d of escalated) {
    if (d.hours_open > oldestHoursOpen) oldestHoursOpen = d.hours_open;
    console.log(
      `[dispute-sla] escalated ${d.id} (trade ${d.trade_id}) — ` +
        `open ${d.hours_open}h, reason="${d.reason}"`,
    );
  }

  return { escalated: escalated.length, oldestHoursOpen };
}
