/**
 * Pure validator — `validate(handoffText, registry)` → `Report`.
 *
 * Verifies the AI handoff's claims against the typed foundation
 * (the registry). Catches drift between `design-system.md` and the
 * canonical `rp-shared.css`.
 *
 * No I/O here; tests pass synthetic handoff text. The CLI does the
 * file read.
 */
import type { Registry } from "../rp-registry/types";

export type IssueType = "unknown-token" | "stale-value";

export interface Issue {
  type: IssueType;
  detail: string;
}

export interface Report {
  ok: boolean;
  issues: Issue[];
  /** Number of distinct token references seen in the handoff. */
  referencedTokens: number;
}

export interface ValidatorOptions {
  /**
   * Token names that are conventionally inherited from the merchant
   * theme rather than declared in `rp-shared.css`. Defaults to
   * `["--rp-primary-color"]`.
   */
  allowMissingTokens?: string[];
}

const DEFAULT_ALLOWLIST = ["--rp-primary-color"];

export function validate(
  handoff: string,
  registry: Registry,
  opts: ValidatorOptions = {}
): Report {
  const allow = new Set(opts.allowMissingTokens ?? DEFAULT_ALLOWLIST);
  const issues: Issue[] = [];
  const referenced = new Set<string>();

  // 1. Every --rp-* reference in the handoff must resolve.
  // The greedy character class captures wildcard family references like
  // `--rp-space-*` as `--rp-space-` (trailing hyphen). Those are
  // documentation conventions, not real token references — filter them
  // out by dropping any capture that ends in a hyphen.
  for (const m of handoff.matchAll(/--rp-[a-z0-9-]+/gi)) {
    const name = m[0];
    if (name.endsWith("-")) continue;
    referenced.add(name);
  }
  for (const ref of referenced) {
    if (allow.has(ref)) continue;
    if (!registry.tokenNames.has(ref)) {
      issues.push({ type: "unknown-token", detail: ref });
    }
  }

  // 2. Color/shadow table rows must match the registry value.
  // We match rows of the form  ` | `--rp-x` | `<value>` |  ` — i.e.
  // both the token name and its value live inside backticks. Numeric
  // scale tables (spacing, font) don't backtick the value column, so
  // they're skipped here on purpose.
  const tableRow = /\|\s*`(--rp-[a-z0-9-]+)`\s*\|\s*`([^`]+)`/gi;
  for (const m of handoff.matchAll(tableRow)) {
    const name = m[1];
    const claim = m[2].trim();
    if (allow.has(name)) continue;
    const token = registry.tokens.find((t) => t.name === name);
    if (!token) continue; // unknown — already flagged in pass 1
    const matchesLight = eq(token.value, claim);
    const matchesDark = token.darkValue ? eq(token.darkValue, claim) : false;
    if (!matchesLight && !matchesDark) {
      issues.push({
        type: "stale-value",
        detail: `${name} claims \`${claim}\` — registry has \`${token.value}\`${
          token.darkValue ? ` / \`${token.darkValue}\`` : ""
        }`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    referencedTokens: referenced.size,
  };
}

function eq(a: string, b: string): boolean {
  return normalize(a) === normalize(b);
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}
