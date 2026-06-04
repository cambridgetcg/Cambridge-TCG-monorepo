/**
 * The actual contract — handwritten because the ledger's API surface
 * is small (3 operations) and stable. If the surface grows, swap this
 * for a TS-AST parser of `points-ledger.server.ts`. The shape (typed
 * canonical) stays the same.
 */
import type { LedgerContract } from "./types";

export const contract: LedgerContract = {
  operations: [
    {
      name: "earnPoints",
      direction: "credit",
      ledgerSource: "EARN_*", // EARN_ORDER, EARN_REFERRAL, etc.
    },
    {
      name: "spendPoints",
      direction: "debit",
      ledgerSource: "SPEND_*", // SPEND_RAFFLE, SPEND_MYSTERY_BOX, etc.
    },
    {
      name: "adjustPoints",
      direction: "either",
      ledgerSource: "MANUAL_CREDIT | MANUAL_DEBIT",
    },
  ],
  forbidden: [
    {
      name: "direct-increment",
      // Matches `pointsBalance: { increment: ... }` in any Prisma update.
      pattern: /pointsBalance\s*:\s*\{\s*increment\b/,
      reason:
        "Use `earnPoints()` from `app/services/points-ledger.server.ts`. " +
        "It atomically increments the balance, records a ledger entry " +
        "with the post-commit balance, and supports idempotency keys.",
    },
    {
      name: "direct-decrement",
      pattern: /pointsBalance\s*:\s*\{\s*decrement\b/,
      reason:
        "Use `spendPoints()` from `app/services/points-ledger.server.ts`. " +
        "It does an atomic conditional decrement (rejects if balance < amount), " +
        "records the ledger entry, and is race-safe under concurrent spends.",
    },
    // ─── Intentionally NOT enforced in v1: direct-assignment ─────────────
    // `pointsBalance: <value>` (literal assignment) is structurally
    // identical between three contexts that regex can't distinguish:
    //   (a) Real DB write: `data: { pointsBalance: 0 }` (DANGEROUS)
    //   (b) JSON response payload: `pointsBalance: balance` (SAFE)
    //   (c) Object spread for analytics: `{ ...c, pointsBalance: x }` (SAFE)
    // First-run trial flagged 13 cases — all (b) or (c). 100% false-
    // positive rate erodes trust faster than missed catches (per the
    // pattern memory's "conservative heuristics over greedy ones" rule).
    //
    // To add direct-assignment back: replace the regex scanner with a
    // TS-AST parser that knows when an expression is inside a Prisma
    // `data: {}` block. The contract type already supports it; only
    // the validator implementation would change.
  ],
  allowedSources: [
    // The ledger module IS the canonical — it's the only place that
    // legitimately writes to `pointsBalance`. Everything else routes
    // through its three exported functions.
    "app/services/points-ledger.server.ts",
  ],
};
