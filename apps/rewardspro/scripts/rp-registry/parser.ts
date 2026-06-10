/**
 * Pure parser — `parse(cssText)` → `Registry`.
 *
 * No I/O here; tests pass synthetic CSS to exercise edge cases.
 * The top-level `index.ts` does the file read.
 */
import type { Registry, Token, Primitive, TokenCategory } from "./types";

export function parse(css: string): Registry {
  const tokens = parseTokens(css);
  const primitives = parsePrimitives(css);

  const byCategory: Record<TokenCategory, Token[]> = {
    spacing: [],
    font: [],
    radius: [],
    shadow: [],
    duration: [],
    easing: [],
    "color-semantic": [],
    "color-state": [],
    "color-rarity": [],
    viewport: [],
  };
  for (const t of tokens) byCategory[t.category].push(t);

  return {
    tokens,
    primitives,
    byCategory,
    tokenNames: new Set(tokens.map((t) => t.name)),
    primitiveNames: new Set(primitives.map((p) => p.name)),
  };
}

/* ─── Tokens ─────────────────────────────────────────────────────────── */

function parseTokens(css: string): Token[] {
  const lightProps = extractCustomProps(extractFirstRoot(css));
  const darkProps = extractCustomProps(extractDarkBlock(css));
  const dark = new Map(darkProps.map((p) => [p.name, p.value]));

  return lightProps.map((p) => {
    const t: Token = {
      name: p.name,
      value: p.value,
      category: categorize(p.name),
    };
    if (dark.has(p.name)) t.darkValue = dark.get(p.name);
    return t;
  });
}

function extractFirstRoot(css: string): string {
  // The first `:root { ... }` block is the canonical token table.
  // Subsequent `:root` blocks (e.g., inside `@supports (height: 100dvh)`)
  // are upgrades, not the source of truth — the lazy `\}` picks the
  // earliest closing brace, which is the one for *this* :root.
  const m = /:root\s*\{([\s\S]*?)\}/.exec(css);
  return m ? m[1] : "";
}

function extractDarkBlock(css: string): string {
  // The dark-mode override block is
  //   `@media (prefers-color-scheme: dark) { :root { ... } }`.
  // Capture the inner :root body — lazy `\}` stops at the inner brace.
  const m =
    /@media\s*\(\s*prefers-color-scheme\s*:\s*dark\s*\)\s*\{[\s\S]*?:root\s*\{([\s\S]*?)\}/.exec(
      css
    );
  return m ? m[1] : "";
}

function extractCustomProps(block: string): Array<{ name: string; value: string }> {
  const out: Array<{ name: string; value: string }> = [];
  for (const m of block.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
    out.push({ name: m[1], value: m[2].trim() });
  }
  return out;
}

function categorize(name: string): TokenCategory {
  if (name.startsWith("--rp-space-")) return "spacing";
  if (name.startsWith("--rp-font-")) return "font";
  if (name.startsWith("--rp-radius-")) return "radius";
  if (name.startsWith("--rp-shadow-")) return "shadow";
  if (name.startsWith("--rp-duration-")) return "duration";
  if (name === "--rp-easing") return "easing";
  if (name.startsWith("--rp-rarity-")) return "color-rarity";
  if (name.startsWith("--rp-color-")) return "color-state";
  if (name === "--rp-100dvh") return "viewport";
  // `--rp-text-*`, `--rp-background-*`, `--rp-card-bg`, `--rp-border-color`,
  // `--rp-primary-color` etc. all live in the same semantic-color family.
  return "color-semantic";
}

/* ─── Primitives ─────────────────────────────────────────────────────── */

function parsePrimitives(css: string): Primitive[] {
  // Every distinct `.rp-*` class name. The character class allows the
  // BEM-style `--` modifier (`rp-btn--primary`) and `__` element
  // (`rp-empty-state__icon`) sub-selectors. Stops at any non-class
  // character (space, comma, colon, brace, etc.).
  //
  // Names that end in a hyphen are documentation wildcards
  // (e.g. comments referring to `.rp-missions-btn--*` — the `*` isn't
  // a class char, so the greedy regex truncates to a trailing dash).
  // Drop those — they're not real classes.
  const seen = new Map<string, number>();
  const lines = css.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(/\.(rp-[a-z0-9_-]+)/gi)) {
      const name = m[1];
      if (name.endsWith("-")) continue;
      if (!seen.has(name)) seen.set(name, i + 1);
    }
  }
  return [...seen.entries()].map(([name, line]) => ({ name, line }));
}
