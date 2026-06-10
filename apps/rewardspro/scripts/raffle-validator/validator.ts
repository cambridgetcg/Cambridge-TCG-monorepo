/**
 * Pure validator — `validate(files, contract)` → `Report`.
 *
 * For each `TableOwnership` rule in the contract, scan every file's
 * source for Prisma client mutation calls (`prisma.<table>.update`,
 * `tx.<table>.create`, `prisma.<table>.upsert`, etc.). When a match is
 * found in a file that's NOT in `allowedSources`, surface as a
 * violation.
 *
 * Same shape as `ledger-validator`; contract structure is richer
 * (per-table allow-lists instead of one global allow-list).
 */
import type { RaffleContract } from "../raffle-contract/types";

export interface Violation {
  path: string;
  line: number;
  /** The table name being mutated (e.g. `raffleEntry`). */
  table: string;
  /** The mutation method name (`update`, `create`, etc.). */
  method: string;
  /** The matched call-site fragment. */
  match: string;
  /** Human-readable line context. */
  context: string;
  /** The contract's reason for the rule. */
  reason: string;
}

export interface Report {
  ok: boolean;
  violations: Violation[];
  filesScanned: number;
}

export interface ScannedFile {
  path: string;
  content: string;
}

/** Prisma mutation methods that constitute a write. */
const MUTATION_METHODS = [
  "create",
  "createMany",
  "update",
  "updateMany",
  "upsert",
  "delete",
  "deleteMany",
];

export function validate(
  files: ScannedFile[],
  contract: RaffleContract
): Report {
  const violations: Violation[] = [];
  const filesScannedSet = new Set<string>();

  // Pre-compute one regex per (table, method) pair. Matches both the
  // `prisma.<table>.<method>(` form and the `tx.<table>.<method>(` form
  // (when the call is inside a `prisma.$transaction` callback).
  const tableRegexes = contract.ownership.map((rule) => ({
    rule,
    regexes: MUTATION_METHODS.map((method) => ({
      method,
      regex: new RegExp(
        `\\b(?:prisma|tx)\\s*\\.\\s*${rule.tableName}\\s*\\.\\s*${method}\\s*\\(`,
        "g"
      ),
    })),
  }));

  for (const file of files) {
    const lines = file.content.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip comment lines so doc references don't count
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      for (const { rule, regexes } of tableRegexes) {
        // Whether THIS file is allowed to mutate THIS table.
        if (rule.allowedSources.includes(file.path)) {
          // Still count it as scanned, but don't treat any match as a violation.
          filesScannedSet.add(file.path);
          continue;
        }
        filesScannedSet.add(file.path);

        for (const { method, regex } of regexes) {
          regex.lastIndex = 0;
          const m = regex.exec(line);
          if (m) {
            violations.push({
              path: file.path,
              line: i + 1,
              table: rule.tableName,
              method,
              match: m[0],
              context: trimmed,
              reason: rule.reason,
            });
          }
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    filesScanned: filesScannedSet.size,
  };
}
