// Compensating-spend wrapper for points-spending reward flows.
//
// The original raffle/box/pack flows call spendPoints() then perform the
// reward work as separate operations. If the reward step fails, the user
// is debited but receives nothing — the worst kind of bug for a points
// system. Wrapping the work in this helper guarantees a refund-on-error
// so the net balance change is always either "spend + outcome" or zero.
//
// This is a compensating transaction, not a true atomic TX. The cost is
// a brief window where the user sees the debit before the refund. The
// benefit is no surgery on the existing earnPoints/spendPoints internals.

import { spendPoints, earnPoints } from "@/lib/membership/db";

export interface AtomicSpendOpts {
  userId: string;
  amount: number;
  type: string;          // typically "redeemed"
  description: string;
  referenceId?: string;
}

export type AtomicSpendResult<T> =
  | { success: true; result: T }
  | { success: false; error: string };

export async function withCompensatingSpend<T>(
  opts: AtomicSpendOpts,
  work: () => Promise<T>,
): Promise<AtomicSpendResult<T>> {
  const spend = await spendPoints(opts.userId, opts.amount, opts.type, opts.description, opts.referenceId);
  if (!spend.success) {
    return { success: false, error: spend.error ?? "Insufficient balance" };
  }
  try {
    const result = await work();
    return { success: true, result };
  } catch (err) {
    // Compensating refund. Best-effort — if THIS fails too the user has a
    // legitimate ledger discrepancy and admin needs to intervene; we log
    // loudly. earnPoints is just a balance bump + ledger insert; it has
    // no other side-effects so re-running it is safe.
    const reason = err instanceof Error ? err.message : "unknown error";
    try {
      await earnPoints(
        opts.userId,
        opts.amount,
        "manual_credit",
        `Refund: ${opts.description} (${reason})`,
        opts.referenceId,
      );
    } catch (refundErr) {
      console.error(
        `[atomic-spend] CRITICAL: refund failed for user=${opts.userId} amount=${opts.amount} ref=${opts.referenceId}`,
        refundErr,
      );
    }
    throw err;
  }
}
