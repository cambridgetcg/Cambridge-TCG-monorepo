/**
 * Pure validator — `validate(files, contract)` → `Report`.
 *
 * Scans every file's text against the contract's forbidden patterns,
 * skipping the contract's `allowedSources` (the ledger module itself).
 * Each match becomes a `Violation` with file path, line number, the
 * matched text, and the contract's reason — surfaced to a CLI or test.
 *
 * Same shape as `handoff-validator` from the design-system chain;
 * different canonical (rewards vs design system).
 */
import type { LedgerContract } from "../ledger-contract/types";

export interface Violation {
  /** Path of the offending file, repo-relative. */
  path: string;
  /** 1-indexed line number. */
  line: number;
  /** Forbidden pattern's name (from the contract). */
  pattern: string;
  /** The matched fragment of the offending line. */
  match: string;
  /** Human-readable line context for the report. */
  context: string;
  /** The contract's reason this is forbidden. */
  reason: string;
}

export interface Report {
  ok: boolean;
  violations: Violation[];
  /** Number of files scanned (excluding allowed sources). */
  filesScanned: number;
}

export interface ScannedFile {
  path: string;
  content: string;
}

export function validate(
  files: ScannedFile[],
  contract: LedgerContract
): Report {
  const allowed = new Set(contract.allowedSources);
  const violations: Violation[] = [];
  let filesScanned = 0;

  for (const file of files) {
    if (allowed.has(file.path)) continue;
    filesScanned++;

    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines that are clearly safe contexts. Without this,
      // regex-only matching produces false positives on:
      //   - Comment lines (`//` / `*`) describing the rule
      //   - Prisma aggregate selectors (`_sum: { pointsBalance: true }`)
      //   - Prisma read selectors (`select: { pointsBalance: true }`)
      //   - TypeScript type declarations (`pointsBalance: number;`)
      //   - JS object spreads (`{ ...customer, pointsBalance: x }`) —
      //     these construct payloads for analytics, not DB writes.
      // This is a deliberate "conservative heuristic over greedy" call
      // (per the pattern memory): false positives erode trust faster
      // than missed catches. A TS-AST parser would catch the spread
      // case more accurately; for now, regex + context filter is the
      // bounded compromise.
      if (isSafeContext(line)) continue;

      for (const fp of contract.forbidden) {
        const m = fp.pattern.exec(line);
        if (m) {
          violations.push({
            path: file.path,
            line: i + 1,
            pattern: fp.name,
            match: m[0],
            context: line.trim(),
            reason: fp.reason,
          });
        }
      }
    }
  }

  return {
    ok: violations.length === 0,
    violations,
    filesScanned,
  };
}

/**
 * Returns true when the line is in a context where `pointsBalance: <value>`
 * is provably not a DB mutation:
 *
 *   - Comment lines (`//` or `*` prefixed)
 *   - Prisma aggregate / read selectors (`_sum`, `_avg`, `_count`,
 *     `_min`, `_max`, `select`, `where`, `orderBy`)
 *   - JavaScript object spreads (`{ ...x, pointsBalance: y }`)
 *   - TypeScript type declarations (line ends with `;` after a type
 *     name like `: number;`, `: string;`, `: boolean;`)
 */
function isSafeContext(line: string): boolean {
  const trimmed = line.trim();

  // Comments
  if (trimmed.startsWith("//") || trimmed.startsWith("*")) return true;

  // Prisma read-side / aggregate selectors and clauses
  if (/\b(?:_sum|_avg|_count|_min|_max|select|where|orderBy|having|groupBy)\s*:/.test(line)) {
    return true;
  }

  // Object spread on the same line — payload construction, not a DB write
  if (/\.\.\.[a-zA-Z_]/.test(line) && /pointsBalance\s*:/.test(line)) return true;

  // TypeScript type declaration: `pointsBalance: <TypeName>;` or `: <TypeName>,`
  // followed by end-of-line. Heuristic: value is a single type identifier
  // and the line ends with `;` or `,` directly after.
  if (
    /pointsBalance\s*:\s*(number|string|boolean|bigint|Date|null|undefined|never|any|unknown|true|false|[A-Z][a-zA-Z0-9_]*)\s*[;,]?\s*(\/\/.*)?$/.test(
      trimmed
    )
  ) {
    return true;
  }

  return false;
}
