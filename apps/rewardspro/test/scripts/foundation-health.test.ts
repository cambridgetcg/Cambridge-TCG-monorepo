/**
 * Composer contract — pure tests with synthetic inputs, plus a golden
 * test that runs the full composition against the real codebase.
 */
import { describe, it, expect } from "vitest";
import { compose, generateHealthReport } from "../../scripts/foundation-health";
import { parse } from "../../scripts/rp-registry";

const FROZEN_NOW = "2026-04-25T00:00:00.000Z";

const tinyRegistry = parse(`
  :root {
    --rp-foo: 1px;
    --rp-bar: 2px;
  }
  .rp-thing { color: red; }
  .rp-thing--alt { color: blue; }
`);

describe("compose() — pure composer with synthetic sibling outputs", () => {
  it("returns ok status when handoff is clean and adoption is high", () => {
    const r = compose({
      validator: { ok: true, issues: [], referencedTokens: 2 },
      usage: {
        tokens: new Map([
          ["--rp-foo", [{ path: "a.css", line: 1 }]],
          ["--rp-bar", [{ path: "a.css", line: 2 }]],
        ]),
        primitives: new Map([
          ["rp-thing", [{ path: "a.css", line: 1 }]],
          ["rp-thing--alt", [{ path: "a.css", line: 2 }]],
        ]),
        unusedTokens: [],
        unusedPrimitives: [],
        filesScanned: 1,
      },
      registry: tinyRegistry,
      now: FROZEN_NOW,
    });
    expect(r.status).toBe("ok");
    expect(r.generatedAt).toBe(FROZEN_NOW);
    expect(r.sections).toHaveLength(3);
    expect(r.sections.every((s) => s.status === "ok")).toBe(true);
  });

  it("escalates to error when handoff has drifted", () => {
    const r = compose({
      validator: {
        ok: false,
        issues: [{ type: "stale-value", detail: "--rp-foo claims #fff" }],
        referencedTokens: 2,
      },
      usage: {
        tokens: new Map([["--rp-foo", [{ path: "a.css", line: 1 }]]]),
        primitives: new Map(),
        unusedTokens: ["--rp-bar"],
        unusedPrimitives: ["rp-thing", "rp-thing--alt"],
        filesScanned: 1,
      },
      registry: tinyRegistry,
      now: FROZEN_NOW,
    });
    expect(r.status).toBe("error");
    const handoffSection = r.sections.find((s) => s.name === "Handoff drift")!;
    expect(handoffSection.status).toBe("error");
    expect(handoffSection.details[0]).toContain("--rp-foo");
  });

  it("warns when adoption ratio is between 40% and 70%", () => {
    // 1 of 2 tokens used (50%), 1 of 2 primitives used (50%) → warning.
    const r = compose({
      validator: { ok: true, issues: [], referencedTokens: 1 },
      usage: {
        tokens: new Map([["--rp-foo", [{ path: "a.css", line: 1 }]]]),
        primitives: new Map([["rp-thing", [{ path: "a.css", line: 1 }]]]),
        unusedTokens: ["--rp-bar"],
        unusedPrimitives: ["rp-thing--alt"],
        filesScanned: 1,
      },
      registry: tinyRegistry,
      now: FROZEN_NOW,
    });
    expect(r.status).toBe("warning");
    const adoption = r.sections.find((s) => s.name === "Token adoption")!;
    expect(adoption.status).toBe("warning");
  });

  it("flags adoption error when both ratios fall below 40%", () => {
    // Build a wider synthetic registry so the "below 40%" branch can be hit.
    const wider = parse(`
      :root {
        --rp-a: 1px;
        --rp-b: 2px;
        --rp-c: 3px;
        --rp-d: 4px;
      }
      .rp-x {} .rp-y {} .rp-z {} .rp-w {}
    `);
    const r = compose({
      validator: { ok: true, issues: [], referencedTokens: 1 },
      usage: {
        tokens: new Map([["--rp-a", [{ path: "a", line: 1 }]]]),
        primitives: new Map([["rp-x", [{ path: "a", line: 1 }]]]),
        unusedTokens: ["--rp-b", "--rp-c", "--rp-d"],
        unusedPrimitives: ["rp-y", "rp-z", "rp-w"],
        filesScanned: 1,
      },
      registry: wider,
      now: FROZEN_NOW,
    });
    expect(r.status).toBe("error");
    const adoption = r.sections.find((s) => s.name === "Token adoption")!;
    expect(adoption.status).toBe("error");
  });

  it("ranks the top-5 hotspots in descending order", () => {
    const r = compose({
      validator: { ok: true, issues: [], referencedTokens: 2 },
      usage: {
        tokens: new Map([
          ["--rp-foo", [...Array(10)].map((_, i) => ({ path: "a", line: i + 1 }))],
          ["--rp-bar", [...Array(3)].map((_, i) => ({ path: "a", line: i + 1 }))],
        ]),
        primitives: new Map(),
        unusedTokens: [],
        unusedPrimitives: ["rp-thing", "rp-thing--alt"],
        filesScanned: 1,
      },
      registry: tinyRegistry,
      now: FROZEN_NOW,
    });
    const hot = r.sections.find((s) => s.name === "Hotspots")!;
    expect(hot.details[0]).toMatch(/10×.*--rp-foo/);
    expect(hot.details[1]).toMatch(/3×.*--rp-bar/);
  });

  it("worst-status wins — single error overrides multiple oks", () => {
    const r = compose({
      validator: {
        ok: false,
        issues: [{ type: "unknown-token", detail: "--rp-frob" }],
        referencedTokens: 2,
      },
      usage: {
        tokens: new Map([
          ["--rp-foo", [{ path: "a.css", line: 1 }]],
          ["--rp-bar", [{ path: "a.css", line: 2 }]],
        ]),
        primitives: new Map([
          ["rp-thing", [{ path: "a.css", line: 1 }]],
          ["rp-thing--alt", [{ path: "a.css", line: 2 }]],
        ]),
        unusedTokens: [],
        unusedPrimitives: [],
        filesScanned: 1,
      },
      registry: tinyRegistry,
      now: FROZEN_NOW,
    });
    expect(r.status).toBe("error");
  });
});

describe("generateHealthReport() — golden run against the real codebase", () => {
  it("returns a well-formed report with three sections", () => {
    const r = generateHealthReport();
    expect(r.sections.map((s) => s.name)).toEqual([
      "Handoff drift",
      "Token adoption",
      "Hotspots",
    ]);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("real handoff is currently clean (Handoff drift section is ok)", () => {
    const r = generateHealthReport();
    const handoff = r.sections.find((s) => s.name === "Handoff drift")!;
    expect(handoff.status).toBe("ok");
  });

  it("real adoption is currently a warning (semantic primitives unadopted)", () => {
    // Aspirational — when widgets adopt the shared primitives, this
    // flips to ok and forces the test to be updated. See
    // usage-analyzer.test.ts for the same pattern at the lower level.
    const r = generateHealthReport();
    const adoption = r.sections.find((s) => s.name === "Token adoption")!;
    expect(adoption.status).toBe("warning");
  });
});
