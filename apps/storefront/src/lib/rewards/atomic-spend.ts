// Compensating-spend wrapper for points-spending reward flows.
//
// ── What this module is for ──────────────────────────────────────────────
//
// Every fairy-tale needs an economy that isn't a fairy-tale. This is
// it. The raffle's draw receipt (provable-fair.ts keeps its legacy filename)
// handles reproducibility; this module handles accounting correctness.
//
// The scenario this exists to refuse is small but cruel: a user spends
// 1,000 Berries to enter ten times, the ledger row commits, then the
// raffle_entries inserts fail. User now has -1,000 Berries and zero
// entries. They contact support. Support compares the points_ledger
// against raffle_entries, finds the gap, refunds. This happens once.
// Nobody trusts the platform with Berries again. The whole rewards
// economy quietly bleeds out.
//
// withCompensatingSpend prevents that scenario the way every brittle
// distributed system prevents it: by building a try-then-undo around
// the work. The points are spent FIRST (visible debit), the work runs,
// and if the work throws, the debit is refunded with a matching credit
// row. Net balance change is either "spend + outcome" or zero —
// **never "spend without outcome".**
//
// ── Why it's a compensating transaction, not a real one ─────────────────
//
// Real atomicity here would require the work() callback to run inside
// the same SQL transaction as the spend. That would couple every reward
// flow's internals to the points ledger's connection — a layering
// violation that grows worse with every domain that wants atomic spend.
// The compensating shape preserves the layering: the ledger doesn't
// know what work is being done; the work doesn't need to know how the
// ledger gets undone.
//
// The cost is honest: there is a brief window where the debit is real
// and the outcome is not yet committed. If the user reloads their
// balance during that window, they see the lower number. The window
// closes within milliseconds in practice. The compensating refund
// posts within the same request lifetime in every documented failure
// mode below.
//
// ── The "best-effort refund" caveat ────────────────────────────────────
//
// If the refund itself fails (DB outage between debit and refund), the
// user has a real ledger discrepancy and admin must intervene. The
// catch block logs aggressively. This is the only known case where
// the platform's points ledger can be wrong; it is documented; it is
// noisy when it happens; it is not silent. Substrate honesty rule 6
// (failures degrade visibly) applies: when this fails, /system/audit
// will see it, the user's /account/standing journey will reflect it,
// and the admin can apply a manual `compensating_credit_admin` adjustment.
//
// ── What this module reaches toward ─────────────────────────────────────
//
//   - apps/storefront/src/lib/rewards/provable-fair.ts — draw receipt code.
//     Together they make raffle entries economically correct here and
//     later reproducible there.
//
//   - apps/storefront/src/lib/membership/db.ts — the points ledger
//     itself (spendPoints, earnPoints). This module is a higher-order
//     wrapper over those two primitives.
//
//   - apps/storefront/src/app/api/rewards/raffles/[id]/enter/route.ts
//     — the primary caller. The "Enter raffle" button passes through
//     here. Every entry on the platform is implicitly a withCompensating-
//     Spend invocation.
//
// See docs/connections/the-sealed-word.md § "Recursion target" — this
// module is named there as the bones beneath the raffle's fairy-tale.
// The recursion the story promised lands here.

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
