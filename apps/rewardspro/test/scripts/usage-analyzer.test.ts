/**
 * Usage analyzer contract.
 *
 * Two layers (same pattern as handoff-validator):
 *   1. Synthetic — `analyze(files, registry)` against tiny hand-crafted
 *      inputs, covering every kind of reference and edge case.
 *   2. Golden — `analyzeWidgetAssets()` runs against the real registry
 *      and the real assets folder; sanity assertions ensure the report
 *      stays meaningful as the codebase evolves.
 */
import { describe, it, expect } from "vitest";
import { analyze, analyzeWidgetAssets } from "../../scripts/usage-analyzer";
import { parse, registry } from "../../scripts/rp-registry";

describe("analyze() — pure analyzer with synthetic registry + files", () => {
  const tinyRegistry = parse(`
    :root {
      --rp-foo: 1px;
      --rp-bar: 2px;
      --rp-baz: 3px;
    }
    .rp-thing { color: red; }
    .rp-thing--alt { color: blue; }
    .rp-other { color: green; }
  `);

  it("records every token reference with file path + line", () => {
    const r = analyze(
      [
        {
          path: "a.css",
          content:
            "\n.x { padding: var(--rp-foo); }\n.y { margin: var(--rp-bar); }",
        },
      ],
      tinyRegistry
    );
    expect(r.tokens.get("--rp-foo")).toEqual([{ path: "a.css", line: 2 }]);
    expect(r.tokens.get("--rp-bar")).toEqual([{ path: "a.css", line: 3 }]);
  });

  it("counts repeated references", () => {
    const r = analyze(
      [
        {
          path: "a.css",
          content: ".x { padding: var(--rp-foo) var(--rp-foo); }",
        },
      ],
      tinyRegistry
    );
    expect(r.tokens.get("--rp-foo")?.length).toBe(2);
  });

  it("ignores unknown tokens (out of registry)", () => {
    const r = analyze(
      [{ path: "a.css", content: ".x { color: var(--rp-mystery); }" }],
      tinyRegistry
    );
    expect(r.tokens.size).toBe(0);
  });

  it("captures primitives from CSS selectors and from class= attributes", () => {
    const r = analyze(
      [
        { path: "a.css", content: ".rp-thing { color: red; }" },
        {
          path: "a.js",
          content: 'el.innerHTML = `<div class="rp-thing--alt">x</div>`;',
        },
      ],
      tinyRegistry
    );
    expect(r.primitives.get("rp-thing")?.length).toBe(1);
    expect(r.primitives.get("rp-thing--alt")?.length).toBe(1);
  });

  it("captures className= (React/JSX style)", () => {
    const r = analyze(
      [{ path: "a.tsx", content: '<div className="rp-thing rp-other" />' }],
      tinyRegistry
    );
    expect(r.primitives.get("rp-thing")?.length).toBe(1);
    expect(r.primitives.get("rp-other")?.length).toBe(1);
  });

  it("lists registry tokens that appear nowhere", () => {
    const r = analyze(
      [{ path: "a.css", content: ".x { padding: var(--rp-foo); }" }],
      tinyRegistry
    );
    expect(r.unusedTokens).toEqual(["--rp-bar", "--rp-baz"]);
  });

  it("lists registry primitives that appear nowhere", () => {
    const r = analyze(
      [{ path: "a.css", content: ".rp-thing { color: red; }" }],
      tinyRegistry
    );
    expect(r.unusedPrimitives).toEqual(["rp-thing--alt", "rp-other"]);
  });

  it("treats --rp-primary-color as theme-inherited (counted, not flagged)", () => {
    // The primary color is not in the registry but is a real reference;
    // it must still appear in the tokens map.
    const r = analyze(
      [{ path: "a.css", content: ".x { color: var(--rp-primary-color); }" }],
      tinyRegistry
    );
    expect(r.tokens.has("--rp-primary-color")).toBe(true);
  });
});

describe("analyzeWidgetAssets() — golden run against the real codebase", () => {
  const report = analyzeWidgetAssets();

  it("scans more than one widget file", () => {
    expect(report.filesScanned).toBeGreaterThan(3);
  });

  it("reports widespread token usage (not all tokens, but most)", () => {
    // Sanity floor — if this drops below 50%, either the regex stopped
    // matching or someone broke the foundation. The exact ratio is
    // intentionally loose so adding a new niche token doesn't fail.
    const usedRatio = report.tokens.size / registry.tokens.length;
    expect(usedRatio).toBeGreaterThan(0.5);
  });

  it("the most-used token is referenced more than 10 times", () => {
    const counts = [...report.tokens.values()].map((v) => v.length);
    const max = Math.max(0, ...counts);
    expect(max).toBeGreaterThan(10);
  });

  it("`--rp-space-md` (a heavily-used spacing token) appears in at least one widget", () => {
    expect(report.tokens.has("--rp-space-md")).toBe(true);
  });

  it("the universal widget root primitive is consumed", () => {
    // `rp-widget-root` (and its siblings — `.rp-raffles-root`, etc.)
    // is the container every widget mounts inside; if no widget
    // references it, something is structurally broken. Pick the
    // shared one as the sentinel.
    expect(report.primitives.has("rp-widget-root")).toBe(true);
  });

  it("the shared `.rp-card` primitive is now ADOPTED (was unused, missions-widget composed it 2026-04-25)", () => {
    // missions-widget.js composes `.rp-card` alongside `.rp-missions-card`
    // for the shared base shape. This assertion locks the adopted state
    // forward — if a refactor accidentally drops the composition, this
    // test fails. Celebrate-adoption pattern: the original "unused"
    // assertion fired when adoption happened, and was reconciled to this
    // positive-form test.
    expect(report.primitives.has("rp-card")).toBe(true);
  });

  it("the shared `.rp-btn--primary` is currently UNUSED — next adoption gap", () => {
    // After `.rp-card` was adopted, the planner still surfaces
    // `.rp-btn--primary` as a candidate — `.rp-missions-btn--primary`
    // mirrors it and could compose. When that migration happens, this
    // assertion fails and is reconciled in turn.
    expect(report.unusedPrimitives).toContain("rp-btn--primary");
  });

  it("every token in the report exists in the registry", () => {
    // The analyzer should never invent token names — it filters by
    // registry membership. This is a guard against regex regressions.
    for (const name of report.tokens.keys()) {
      // --rp-primary-color is theme-inherited (allowed even if absent)
      if (name === "--rp-primary-color") continue;
      expect(registry.tokenNames.has(name), `unknown token reported: ${name}`).toBe(true);
    }
  });
});
