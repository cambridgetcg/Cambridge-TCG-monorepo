/**
 * Typed contract for the points ledger — the financial canonical of
 * the rewards module.
 *
 * Every points mutation in this codebase MUST flow through one of
 * three operations defined here. Direct writes to `customer.pointsBalance`
 * outside the ledger module bypass the audit trail, the atomic
 * race-safety guarantees, and the idempotency-key dedup. The contract
 * names those direct writes as `ForbiddenPattern`s, and the
 * `ledger-validator` enforces them.
 *
 * Same role the `Registry` plays for the design system, applied to
 * the rewards domain.
 */
export type LedgerDirection = "credit" | "debit" | "either";

export interface LedgerOperation {
  /** Function name as it appears in `points-ledger.server.ts`. */
  name: "earnPoints" | "spendPoints" | "adjustPoints";
  /** Which way the balance moves under this operation. */
  direction: LedgerDirection;
  /** What `LedgerEntry.source` value is recorded. */
  ledgerSource: string;
}

export interface ForbiddenPattern {
  /** Display name surfaced in violation reports. */
  name: string;
  /** Regex that matches the forbidden mutation in source text. */
  pattern: RegExp;
  /** Plain-language explanation of why this is forbidden. */
  reason: string;
}

export interface LedgerContract {
  operations: LedgerOperation[];
  /** Patterns the ledger forbids OUTSIDE the allowed sources. */
  forbidden: ForbiddenPattern[];
  /**
   * Files that ARE the ledger module — they're the canonical source
   * and exempt from the forbidden-pattern check. Paths are relative
   * to the repo root.
   */
  allowedSources: string[];
}
