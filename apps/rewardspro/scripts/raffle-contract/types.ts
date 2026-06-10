/**
 * Typed contract for the raffles submodule — table-ownership rules.
 *
 * Where the ledger contract is about a single FIELD (`pointsBalance`)
 * with a single canonical owner, the raffle contract is about multiple
 * TABLES, each with its own canonical owner. The shape is similar
 * (allowed-sources allowlist) but parameterized over multiple tables.
 *
 * Derived from the level-3 dive (2026-04-25): raffles is a 10-file
 * submodule with two clear pipelines (entry → outcome). Each pipeline
 * has its own canonical writer; cross-pipeline mutation is the bug
 * class (e.g., raffle-instant-win.server.ts mutating raffleEntry,
 * which should be raffle-entry.server.ts's exclusive territory).
 */
export interface TableOwnership {
  /** Prisma client model name as used at call sites (camelCase). */
  tableName: string;
  /**
   * Repo-relative paths of files that legitimately mutate this table.
   * Mutations from any other file are flagged as a contract violation.
   */
  allowedSources: string[];
  /** Plain-language reason for the rule, surfaced in violation reports. */
  reason: string;
}

export interface RaffleContract {
  /** One ownership rule per protected table. */
  ownership: TableOwnership[];
}
