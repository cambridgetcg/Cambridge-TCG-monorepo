/**
 * Handoff validator contract.
 *
 * Two layers of testing:
 *   1. Synthetic — `validate(text, registry)` against hand-crafted
 *      handoff snippets, covering pass + every failure mode.
 *   2. Golden — the real `design-system.md` validates against the real
 *      registry. If a future handoff edit drifts from the CSS, this
 *      test fails before any AI generation does.
 */
import { describe, it, expect } from "vitest";
import {
  validate,
  validateCanonicalHandoff,
} from "../../scripts/handoff-validator";
import { parse, registry } from "../../scripts/rp-registry";

const MINI_CSS = `
  :root {
    --rp-space-md: 12px;
    --rp-text-color: #212B36;
    --rp-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --rp-text-color: rgba(255, 255, 255, 0.92);
    }
  }
`;
const miniRegistry = parse(MINI_CSS);

describe("validate() — pure validator with synthetic registry", () => {
  it("passes when every reference resolves and every value matches", () => {
    const handoff = `
| Token | Hex | Role |
|---|---|---|
| \`--rp-text-color\` | \`#212B36\` | Primary text |
| \`--rp-shadow-sm\` | \`0 1px 2px rgba(0,0,0,0.05)\` | Cards at rest |

Use \`var(--rp-space-md)\` for card padding.
    `;
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
    expect(r.referencedTokens).toBe(3);
  });

  it("flags an unknown token reference", () => {
    const handoff = "Use `var(--rp-frob)` for that.";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(false);
    expect(r.issues).toContainEqual({ type: "unknown-token", detail: "--rp-frob" });
  });

  it("allows --rp-primary-color by default (theme-inherited)", () => {
    const handoff = "Use `var(--rp-primary-color)` for the accent.";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(true);
  });

  it("respects a custom allowlist", () => {
    const handoff = "Use `var(--rp-frob)` here.";
    const r = validate(handoff, miniRegistry, { allowMissingTokens: ["--rp-frob"] });
    expect(r.ok).toBe(true);
  });

  it("flags a stale hex value in a token table", () => {
    const handoff = "| `--rp-text-color` | `#000000` | Body |";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(false);
    const stale = r.issues.find((i) => i.type === "stale-value")!;
    expect(stale.detail).toContain("--rp-text-color");
    expect(stale.detail).toContain("#000000");
    expect(stale.detail).toContain("#212B36");
  });

  it("accepts a value that matches the dark-mode override", () => {
    // The same token appears twice in the handoff — once in the light
    // table and once in the dark table. Both are valid and shouldn't
    // be flagged just because one differs from `value`.
    const handoff = "| `--rp-text-color` | `rgba(255, 255, 255, 0.92)` |";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(true);
  });

  it("normalizes whitespace in shadow values", () => {
    // Registry has `0 1px 2px rgba(0, 0, 0, 0.05)` (with spaces).
    // Handoff has `0 1px 2px rgba(0,0,0,0.05)` (no spaces). Match.
    const handoff = "| `--rp-shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` |";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(true);
  });

  it("does NOT flag a numeric scale row (no backticks on value)", () => {
    // Spacing/font tables don't backtick the value column on purpose.
    // The validator skips them — they rarely drift, and parsing them
    // would inflate false-positive rate.
    const handoff = "| `--rp-space-md` | 12px | Card internal gap |";
    const r = validate(handoff, miniRegistry);
    expect(r.ok).toBe(true);
  });
});

describe("validateCanonicalHandoff() — golden test against real handoff + real registry", () => {
  it("the shipped handoff validates against the shipped registry", () => {
    const r = validateCanonicalHandoff();
    if (!r.ok) {
      // Surface the issues so the failure message is actionable.
      const detail = r.issues
        .map((i) => `  [${i.type}] ${i.detail}`)
        .join("\n");
      throw new Error(
        `Real handoff has drifted from registry:\n${detail}\n\nFix design-system.md to match rp-shared.css.`
      );
    }
    expect(r.ok).toBe(true);
    // Sanity floor — if this drops to zero, the regex stopped matching anything.
    expect(r.referencedTokens).toBeGreaterThan(15);
  });

  it("registry has the tokens the handoff references", () => {
    // Defensive: ensure the registry is non-empty so the golden test
    // above isn't trivially passing because everything is filtered.
    expect(registry.tokens.length).toBeGreaterThan(20);
  });
});
