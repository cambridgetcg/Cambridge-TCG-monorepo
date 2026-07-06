/**
 * The system theme's sync contract, pinned.
 *
 * themes.css duplicates the [data-theme="midnight"] declaration block
 * inside `@media (prefers-color-scheme: dark) { [data-theme="system"] }`
 * because CSS cannot share one declaration block across a media-query
 * boundary. Duplication without a guard rots; this test is the guard.
 *
 * Contract (named on both blocks in themes.css):
 *   1. The media-guarded system block is a VERBATIM copy of the midnight
 *      bundle — same declarations, same order, including
 *      `color-scheme: dark`.
 *   2. The base [data-theme="system"] block declares ONLY
 *      `color-scheme: light dark` — its light half is inherited from the
 *      :root/gallery defaults, never restated. That is the one
 *      intentional color-scheme difference between the blocks.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

/** Strip CSS block comments so commentary (which quotes selectors, e.g.
 * the sync-contract warnings themselves) never matches as a rule. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const css = stripComments(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "themes.css"), "utf8"),
);

/**
 * Return the declaration block (between braces) of the first rule whose
 * selector matches `selectorRe` within `source`. Token bundles contain
 * no nested braces, so a flat scan suffices.
 */
function extractBlock(source: string, selectorRe: RegExp, label: string): string {
  const m = selectorRe.exec(source);
  if (!m) throw new Error(`Could not find ${label} in themes.css`);
  const open = source.indexOf("{", m.index);
  const close = source.indexOf("}", open);
  if (open === -1 || close === -1) throw new Error(`Unbalanced braces at ${label}`);
  return source.slice(open + 1, close);
}

/** Brace-matched body of the first media block whose query matches. */
function extractMediaBody(source: string, query: string): string {
  const idx = source.indexOf(query);
  if (idx === -1) throw new Error(`Could not find ${query} in themes.css`);
  const open = source.indexOf("{", idx);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces in ${query}`);
}

/** Whitespace-normalized declarations, in source order. */
function declarations(block: string): string[] {
  return block
    .split(";")
    .map((d) => d.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

// The bare attribute selector followed directly by "{" — this cannot
// match compound selectors like `[data-theme="midnight"] .wardrobe-rise`.
const MIDNIGHT_RULE = /\[data-theme="midnight"\]\s*\{/;
const SYSTEM_RULE = /\[data-theme="system"\]\s*\{/;

const midnight = declarations(
  extractBlock(css, MIDNIGHT_RULE, '[data-theme="midnight"] bundle'),
);
const darkMediaBody = extractMediaBody(css, "@media (prefers-color-scheme: dark)");
const systemDark = declarations(
  extractBlock(darkMediaBody, SYSTEM_RULE, 'media-guarded [data-theme="system"] bundle'),
);
const systemBase = declarations(
  extractBlock(css, SYSTEM_RULE, 'base [data-theme="system"] block'),
);

describe("themes.css system/midnight sync contract", () => {
  it("both blocks exist and carry declarations", () => {
    expect(midnight.length).toBeGreaterThan(0);
    expect(systemDark.length).toBeGreaterThan(0);
  });

  it("the dark half of system duplicates the midnight bundle verbatim (except color-scheme, asserted separately)", () => {
    const noScheme = (decls: string[]) =>
      decls.filter((d) => !d.startsWith("color-scheme"));
    expect(noScheme(systemDark)).toEqual(noScheme(midnight));
  });

  it("midnight and system's dark half both declare color-scheme: dark", () => {
    expect(midnight).toContain("color-scheme: dark");
    expect(systemDark).toContain("color-scheme: dark");
  });

  it("the base system block declares only color-scheme: light dark — its light half must inherit the :root gallery values, never restate them", () => {
    expect(systemBase).toEqual(["color-scheme: light dark"]);
  });
});
