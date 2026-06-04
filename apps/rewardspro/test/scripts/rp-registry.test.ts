/**
 * Registry contract — pins the parsed shape against the real `rp-shared.css`.
 *
 * If a token is renamed, deleted, or slips out of the canonical :root,
 * a test here fails and forces every consumer (handoff, scorer,
 * future validators) to be updated alongside.
 */
import { describe, it, expect } from "vitest";
import {
  registry,
  parse,
  tokenValue,
  isKnownToken,
  isKnownPrimitive,
} from "../../scripts/rp-registry";

describe("registry — parsed from rp-shared.css", () => {
  it("loads without throwing and has tokens + primitives", () => {
    expect(registry.tokens.length).toBeGreaterThan(20);
    expect(registry.primitives.length).toBeGreaterThan(10);
  });

  it("every category from the typed union has at least one token", () => {
    for (const cat of [
      "spacing",
      "font",
      "radius",
      "shadow",
      "duration",
      "easing",
      "color-semantic",
      "color-state",
      "color-rarity",
      "viewport",
    ] as const) {
      expect(
        registry.byCategory[cat].length,
        `category "${cat}" should have at least one token`
      ).toBeGreaterThan(0);
    }
  });

  it("spacing scale is the documented 6-step set", () => {
    const names = registry.byCategory.spacing.map((t) => t.name);
    expect(names).toEqual([
      "--rp-space-xs",
      "--rp-space-sm",
      "--rp-space-md",
      "--rp-space-lg",
      "--rp-space-xl",
      "--rp-space-2xl",
    ]);
  });

  it("font scale is the documented 6-step set", () => {
    const names = registry.byCategory.font.map((t) => t.name);
    expect(names).toEqual([
      "--rp-font-xs",
      "--rp-font-sm",
      "--rp-font-md",
      "--rp-font-lg",
      "--rp-font-xl",
      "--rp-font-2xl",
    ]);
  });

  it("radius scale has exactly four steps", () => {
    expect(registry.byCategory.radius.map((t) => t.name)).toEqual([
      "--rp-radius-sm",
      "--rp-radius-md",
      "--rp-radius-lg",
      "--rp-radius-full",
    ]);
  });

  it("shadow scale has exactly four steps", () => {
    expect(registry.byCategory.shadow.map((t) => t.name)).toEqual([
      "--rp-shadow-sm",
      "--rp-shadow-md",
      "--rp-shadow-lg",
      "--rp-shadow-xl",
    ]);
  });

  it("rarity palette has exactly five tiers", () => {
    expect(registry.byCategory["color-rarity"].map((t) => t.name)).toEqual([
      "--rp-rarity-common",
      "--rp-rarity-uncommon",
      "--rp-rarity-rare",
      "--rp-rarity-epic",
      "--rp-rarity-legendary",
    ]);
  });

  it("state colors are the documented success/error/warning trio", () => {
    expect(registry.byCategory["color-state"].map((t) => t.name)).toEqual([
      "--rp-color-success",
      "--rp-color-error",
      "--rp-color-warning",
    ]);
  });

  it("captures dark-mode overrides for semantic colors", () => {
    const text = registry.tokens.find((t) => t.name === "--rp-text-color")!;
    expect(text.value).toMatch(/^#212B36$/i);
    expect(text.darkValue).toMatch(/rgba\(255,\s*255,\s*255/);
  });

  it("11px floor: --rp-font-xs is 0.6875rem", () => {
    expect(tokenValue("--rp-font-xs")).toBe("0.6875rem");
  });

  it("identifies known and unknown tokens", () => {
    expect(isKnownToken("--rp-space-md")).toBe(true);
    expect(isKnownToken("--rp-frobnicate")).toBe(false);
  });

  it("identifies known primitives", () => {
    for (const name of [
      "rp-btn",
      "rp-btn--primary",
      "rp-btn--secondary",
      "rp-btn--ghost",
      "rp-btn-link",
      "rp-card",
      "rp-pill",
      "rp-pill--success",
      "rp-section-title",
      "rp-headline",
      "rp-label",
      "rp-meta",
      "rp-empty-state",
      "rp-skel",
    ]) {
      expect(isKnownPrimitive(name), `expected primitive: ${name}`).toBe(true);
    }
  });
});

describe("parse() — pure parser exposes synthetic-CSS testing", () => {
  it("extracts tokens from a minimal :root block", () => {
    const r = parse(`
      :root {
        --rp-space-xs: 4px;
        --rp-color-success: #22c55e;
      }
    `);
    expect(r.tokens.length).toBe(2);
    expect(r.byCategory.spacing[0]).toMatchObject({
      name: "--rp-space-xs",
      value: "4px",
      category: "spacing",
    });
    expect(r.byCategory["color-state"][0]).toMatchObject({
      name: "--rp-color-success",
      value: "#22c55e",
      category: "color-state",
    });
  });

  it("merges dark-mode overrides into the same token records", () => {
    const r = parse(`
      :root {
        --rp-text-color: #000;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --rp-text-color: rgba(255, 255, 255, 0.9);
        }
      }
    `);
    const t = r.tokens.find((t) => t.name === "--rp-text-color")!;
    expect(t.value).toBe("#000");
    expect(t.darkValue).toBe("rgba(255, 255, 255, 0.9)");
  });

  it("dedupes primitives that appear in selector lists", () => {
    const r = parse(`
      .rp-foo, .rp-foo--bar { color: red; }
      .rp-foo:hover { color: blue; }
    `);
    expect(r.primitives.map((p) => p.name).sort()).toEqual(["rp-foo", "rp-foo--bar"]);
  });

  it("ignores documentation wildcards captured with trailing hyphen", () => {
    // A comment like `.rp-foo--*` truncates under the greedy regex to
    // `.rp-foo--` (since `*` is not a class char). Those aren't real
    // classes — they must NOT appear in the registry.
    const r = parse(`
      /* See .rp-foo--* and .rp-bar--* for the family */
      .rp-foo--primary { color: red; }
    `);
    expect(r.primitives.map((p) => p.name)).toEqual(["rp-foo--primary"]);
    expect(r.primitives.map((p) => p.name)).not.toContain("rp-foo--");
    expect(r.primitives.map((p) => p.name)).not.toContain("rp-bar--");
  });

  it("ignores `:root` blocks inside @supports — first :root wins", () => {
    const r = parse(`
      :root {
        --rp-100dvh: 100vh;
      }
      @supports (height: 100dvh) {
        :root {
          --rp-100dvh: 100dvh;
        }
      }
    `);
    expect(tokenValueOf(r, "--rp-100dvh")).toBe("100vh");
  });
});

function tokenValueOf(r: ReturnType<typeof parse>, name: string): string | undefined {
  return r.tokens.find((t) => t.name === name)?.value;
}
