/**
 * Planner contract.
 *
 *   1. Pure synthetic — every matching pattern, every confidence
 *      branch, every empty-output edge case.
 *   2. Golden — runs against the real codebase and asserts that the
 *      planner surfaces the well-known adoption gap (`.rp-btn` family
 *      in particular). When a future PR adopts `.rp-btn` in the
 *      widgets, the golden assertion will need updating — that's the
 *      celebrate-adoption signal, same pattern as `usage-analyzer`.
 */
import { describe, it, expect } from "vitest";
import {
  plan,
  generateMigrationPlan,
} from "../../scripts/migration-planner";
import { parse } from "../../scripts/rp-registry";
import type { UsageReport } from "../../scripts/usage-analyzer/types";

const FROZEN = "2026-04-25T00:00:00.000Z";

const tinyRegistry = parse(`
  :root { --rp-foo: 1px; }
  .rp-btn { color: red; }
  .rp-card { color: blue; }
`);

function emptyUsage(unused: string[] = []): UsageReport {
  return {
    tokens: new Map(),
    primitives: new Map(),
    unusedTokens: [],
    unusedPrimitives: unused,
    filesScanned: 0,
  };
}

describe("plan() — pure planner with synthetic inputs", () => {
  it("returns no suggestions when no unused primitives", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage([]),
      files: [{ path: "a.css", content: ".rp-gc-btn { color: red; }" }],
      now: FROZEN,
    });
    expect(r.suggestions).toEqual([]);
    expect(r.totalEstimatedChanges).toBe(0);
  });

  it("matches a widget-local primitive whose name mirrors the unused shared primitive", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn"]),
      files: [
        { path: "a.css", content: ".rp-gc-btn { color: red; }" },
        { path: "a.js", content: 'el.classList.add("rp-gc-btn");' },
      ],
      now: FROZEN,
    });
    expect(r.suggestions).toHaveLength(1);
    expect(r.suggestions[0].target).toBe("rp-btn");
    expect(r.suggestions[0].candidates[0].name).toBe("rp-gc-btn");
    // CSS selector + JS reference = 2 hits; class= regex won't match the `rp-` only suffix.
    expect(r.suggestions[0].candidates[0].referenceCount).toBeGreaterThanOrEqual(2);
  });

  it("ignores names already in the registry — they're shared, not widget-local", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn"]),
      files: [
        // rp-btn is in the registry; this is the shared primitive itself,
        // not a widget-local mirror.
        { path: "rp-shared.css", content: ".rp-btn { padding: 8px; }" },
      ],
      now: FROZEN,
    });
    expect(r.suggestions).toEqual([]);
  });

  it("ranks suggestions by total reference count (descending)", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn", "rp-card"]),
      files: [
        // rp-card has 1 candidate with 2 refs
        { path: "x.css", content: ".rp-gc-card .rp-gc-card .x { color: red; }" },
        // rp-btn has 1 candidate with 5 refs
        {
          path: "y.css",
          content:
            ".rp-mb-btn .rp-mb-btn .rp-mb-btn .rp-mb-btn .rp-mb-btn { color: red; }",
        },
      ],
      now: FROZEN,
    });
    expect(r.suggestions[0].target).toBe("rp-btn"); // higher refs first
    expect(r.suggestions[1].target).toBe("rp-card");
  });

  it("classifies confidence as `high` when ≥2 candidates each ≥5 refs", () => {
    const fiveRefs = (cls: string) => `.${cls} `.repeat(5);
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn"]),
      files: [
        { path: "a.css", content: fiveRefs("rp-gc-btn") + "{ color: red; }" },
        { path: "b.css", content: fiveRefs("rp-mb-btn") + "{ color: red; }" },
      ],
      now: FROZEN,
    });
    expect(r.suggestions[0].confidence).toBe("high");
  });

  it("classifies confidence as `medium` for one strong candidate or several weak ones", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn"]),
      files: [
        // Two candidates, but only one with ≥5 refs.
        {
          path: "a.css",
          content:
            ".rp-gc-btn ".repeat(6) + ".rp-mb-btn .rp-mb-btn { color: red; }",
        },
      ],
      now: FROZEN,
    });
    expect(r.suggestions[0].confidence).toBe("medium");
  });

  it("classifies confidence as `low` for a single low-count candidate", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn"]),
      files: [{ path: "a.css", content: ".rp-gc-btn { color: red; }" }],
      now: FROZEN,
    });
    expect(r.suggestions[0].confidence).toBe("low");
  });

  it("does NOT match multi-segment primitives like rp-empty-state — heuristic stays conservative", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-empty-state"]),
      files: [{ path: "a.css", content: ".rp-gc-empty-state { color: red; }" }],
      now: FROZEN,
    });
    expect(r.suggestions).toEqual([]);
  });

  it("freezes the timestamp when one is provided", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage([]),
      files: [],
      now: FROZEN,
    });
    expect(r.generatedAt).toBe(FROZEN);
  });

  it("totalEstimatedChanges sums every candidate's referenceCount", () => {
    const r = plan({
      registry: tinyRegistry,
      usage: emptyUsage(["rp-btn", "rp-card"]),
      files: [
        // 3 refs to rp-gc-btn
        { path: "a.css", content: ".rp-gc-btn .rp-gc-btn .rp-gc-btn { color: red; }" },
        // 2 refs to rp-mb-card
        { path: "b.css", content: ".rp-mb-card .rp-mb-card { color: red; }" },
      ],
      now: FROZEN,
    });
    expect(r.totalEstimatedChanges).toBe(5);
  });
});

describe("generateMigrationPlan() — golden run against the real codebase", () => {
  const real = generateMigrationPlan();

  it("returns a well-formed plan", () => {
    expect(real.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(typeof real.totalEstimatedChanges).toBe("number");
  });

  it(".rp-card no longer appears as an adoption-gap suggestion (adopted 2026-04-25)", () => {
    // missions-widget composed `.rp-card` alongside `.rp-missions-card`,
    // so the shared primitive's reference count is now > 0 and the
    // analyzer no longer flags it as unused. The planner correctly
    // produces no suggestion for it.
    const card = real.suggestions.find((s) => s.target === "rp-card");
    expect(card).toBeUndefined();
  });

  it(".rp-btn--primary is the next adoption-gap suggestion", () => {
    // `.rp-missions-btn--primary` mirrors the shared `.rp-btn--primary`.
    // Until missions-widget composes it, this assertion holds — and
    // when adoption happens, it fails and is reconciled (same pattern
    // as `.rp-card` was).
    const btn = real.suggestions.find((s) => s.target === "rp-btn--primary");
    expect(btn, "expected a migration suggestion targeting `.rp-btn--primary`").toBeTruthy();
    expect(btn!.candidates.length).toBeGreaterThan(0);
  });

  it("suggestions are ordered by impact (descending)", () => {
    for (let i = 1; i < real.suggestions.length; i++) {
      const prev = real.suggestions[i - 1].candidates.reduce(
        (s, c) => s + c.referenceCount,
        0
      );
      const curr = real.suggestions[i].candidates.reduce(
        (s, c) => s + c.referenceCount,
        0
      );
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });
});
