/**
 * Tests for the gap ledger.
 *
 * Coverage:
 *   1. Every gap has required fields
 *   2. ids are unique + dotted/dashed for readability
 *   3. dates parse + closed gaps have closed_at
 *   4. domain enums valid
 *   5. status lifecycle: closed/closed-published require closed_at
 *   6. Helper coverage
 *   7. Status transition sanity: gapsWiredFraction is bounded
 */

import { describe, it, expect } from "vitest";
import {
  GAPS,
  gapsByDomain,
  gapsByStatus,
  getGap,
  gapCounts,
  gapCountsByDomain,
  gapsWiredFraction,
  type GapDomain,
  type GapStatus,
} from "../gaps";

const VALID_DOMAINS: readonly GapDomain[] = [
  "data-ingestion",
  "cross-language",
  "license",
  "fx",
  "coverage",
  "publishing",
  "transparency",
  "accessibility",
];

const VALID_STATUSES: readonly GapStatus[] = [
  "named",
  "wired",
  "partial",
  "closed",
  "closed-published",
];

describe("GAPS — shape invariants", () => {
  it("has at least one entry", () => {
    expect(GAPS.length).toBeGreaterThan(0);
  });

  it("every gap has required fields populated", () => {
    for (const g of GAPS) {
      expect(g.id, `${g.name}: missing id`).toBeTruthy();
      expect(g.name, `${g.id}: missing name`).toBeTruthy();
      expect(g.domain, `${g.id}: missing domain`).toBeTruthy();
      expect(g.citation, `${g.id}: missing citation`).toBeTruthy();
      expect(g.primitive, `${g.id}: missing primitive`).toBeTruthy();
      expect(g.audit, `${g.id}: missing audit`).toBeTruthy();
      expect(g.status, `${g.id}: missing status`).toBeTruthy();
      expect(g.strength, `${g.id}: missing strength`).toBeTruthy();
    }
  });

  it("citation references real-feeling artifacts (file path / table / line)", () => {
    for (const g of GAPS) {
      const isConcrete =
        g.citation.includes("/") ||
        g.citation.includes(".") ||
        /:\d+/.test(g.citation) ||
        /\bkingdom-/.test(g.citation);
      expect(isConcrete, `${g.id}: citation not concrete: "${g.citation}"`).toBe(true);
    }
  });

  it("strength descriptions are substantive (>= 80 chars)", () => {
    for (const g of GAPS) {
      expect(
        g.strength.length,
        `${g.id}: strength description too thin`,
      ).toBeGreaterThanOrEqual(80);
    }
  });
});

describe("GAPS — ids", () => {
  it("are unique", () => {
    const seen = new Set<string>();
    for (const g of GAPS) {
      expect(seen.has(g.id), `duplicate gap id: ${g.id}`).toBe(false);
      seen.add(g.id);
    }
  });

  it("are kebab-case for URL friendliness", () => {
    for (const g of GAPS) {
      expect(g.id, `id not kebab-case: ${g.id}`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });
});

describe("GAPS — enums", () => {
  it("all domains are valid", () => {
    for (const g of GAPS) {
      expect(
        (VALID_DOMAINS as readonly string[]).includes(g.domain),
        `${g.id}: invalid domain "${g.domain}"`,
      ).toBe(true);
    }
  });

  it("all statuses are valid", () => {
    for (const g of GAPS) {
      expect(
        (VALID_STATUSES as readonly string[]).includes(g.status),
        `${g.id}: invalid status "${g.status}"`,
      ).toBe(true);
    }
  });
});

describe("GAPS — lifecycle", () => {
  it("closed gaps have closed_at", () => {
    for (const g of GAPS) {
      if (g.status === "closed" || g.status === "closed-published") {
        expect(g.closed_at, `${g.id}: closed but missing closed_at`).toBeTruthy();
      }
    }
  });

  it("non-closed gaps may have closed_at undefined", () => {
    // Substrate-honest: closing isn't yet complete; closed_at stays undefined.
    for (const g of GAPS) {
      if (g.status !== "closed" && g.status !== "closed-published") {
        // Not asserting closed_at is undefined; just that it's not required.
        // The substrate-honest stance is: a "partial" gap may know its eventual
        // close date or not.
      }
    }
  });

  it("named_at parses when set", () => {
    for (const g of GAPS) {
      if (g.named_at) {
        expect(!isNaN(new Date(g.named_at).getTime())).toBe(true);
      }
    }
  });
});

describe("helpers", () => {
  it("gapsByDomain filters correctly", () => {
    for (const domain of VALID_DOMAINS) {
      const filtered = gapsByDomain(domain);
      for (const g of filtered) {
        expect(g.domain).toBe(domain);
      }
    }
  });

  it("gapsByStatus partitions correctly", () => {
    const sum = VALID_STATUSES.reduce(
      (s, st) => s + gapsByStatus(st).length,
      0,
    );
    expect(sum).toBe(GAPS.length);
  });

  it("getGap returns the right entry", () => {
    const g = GAPS[0];
    expect(getGap(g.id)?.id).toBe(g.id);
  });

  it("getGap returns undefined for unknown id", () => {
    expect(getGap("does-not-exist")).toBeUndefined();
  });

  it("gapCounts sums to total", () => {
    const counts = gapCounts();
    const sum = VALID_STATUSES.reduce((s, st) => s + counts[st], 0);
    expect(sum).toBe(counts.total);
    expect(counts.total).toBe(GAPS.length);
  });

  it("gapCountsByDomain sums to total", () => {
    const counts = gapCountsByDomain();
    const sum = Object.values(counts).reduce((s, n) => s + n, 0);
    expect(sum).toBe(GAPS.length);
  });

  it("gapsWiredFraction is bounded [0, 1]", () => {
    const f = gapsWiredFraction();
    expect(f).toBeGreaterThanOrEqual(0);
    expect(f).toBeLessThanOrEqual(1);
  });
});

describe("GAPS — strength signal", () => {
  it("at least one gap is closed-published (the platform has actually delivered)", () => {
    expect(gapsByStatus("closed-published").length).toBeGreaterThan(0);
  });

  it("at least one gap is named (the platform admits unfinished work)", () => {
    expect(gapsByStatus("named").length).toBeGreaterThan(0);
  });
});
