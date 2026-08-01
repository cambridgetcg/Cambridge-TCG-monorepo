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

/**
 * The painted rooms' sync contract (2026-08-01, the-painted-rooms spec).
 *
 * A room (`.wardrobe-wall--*`) may re-bind semantic tokens under its
 * light gate — but that gate also matches [data-theme="system"] in a
 * dark scheme, so a dark media block must reset every such token to the
 * MIDNIGHT bundle's value. Those resets are hand copies; hand copies
 * rot without a guard. This is the guard:
 *   1. every token a dark-media system room rule declares equals the
 *      midnight bundle's value for that token (background-color is the
 *      one deliberate difference — a room's wall is its own);
 *   2. every token a light-gated system room rule declares has a
 *      dark-media reset for the same room (nothing leaks).
 */
function allDarkMediaBodies(source: string): string[] {
  const bodies: string[] = [];
  const query = "@media (prefers-color-scheme: dark)";
  let idx = 0;
  while ((idx = source.indexOf(query, idx)) !== -1) {
    const open = source.indexOf("{", idx);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
      if (source[i] === "{") depth++;
      else if (source[i] === "}") {
        depth--;
        if (depth === 0) {
          bodies.push(source.slice(open + 1, i));
          idx = i;
          break;
        }
      }
    }
    idx++;
  }
  return bodies;
}

/** room name → (custom property → value) for every rule whose selector
 * list includes `[data-theme="system"] .wardrobe-wall--<room>`. The
 * innermost-block regex never matches a media header (headers precede
 * an unmatched `{`). */
function systemRoomTokens(scope: string): Map<string, Map<string, string>> {
  const rooms = new Map<string, Map<string, string>>();
  const rule = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = rule.exec(scope))) {
    const selector = m[1].replace(/\s+/g, " ").trim();
    const room = /\[data-theme="system"\] \.wardrobe-wall--([a-z-]+)/.exec(selector)?.[1];
    if (!room) continue;
    const tokens = rooms.get(room) ?? new Map<string, string>();
    for (const d of declarations(m[2])) {
      const colon = d.indexOf(":");
      const prop = d.slice(0, colon).trim();
      if (prop.startsWith("--")) tokens.set(prop, d.slice(colon + 1).trim());
    }
    rooms.set(room, tokens);
  }
  return rooms;
}

describe("themes.css painted-rooms sync contract", () => {
  const darkBodies = allDarkMediaBodies(css);
  const lightScope = darkBodies.reduce((s, b) => s.replace(b, ""), css);
  const lightRooms = systemRoomTokens(lightScope);
  const darkRooms = systemRoomTokens(darkBodies.join("\n"));
  const midnightTokens = new Map(
    midnight
      .filter((d) => d.startsWith("--"))
      .map((d) => {
        const colon = d.indexOf(":");
        return [d.slice(0, colon).trim(), d.slice(colon + 1).trim()] as const;
      }),
  );

  it("rooms exist on both sides of the media boundary", () => {
    expect(lightRooms.size).toBeGreaterThan(0);
    expect(darkRooms.size).toBeGreaterThan(0);
  });

  it("every dark-media room token equals the midnight bundle's value", () => {
    for (const [room, tokens] of darkRooms) {
      for (const [prop, value] of tokens) {
        expect(
          midnightTokens.get(prop),
          `dark ${room} room re-declares ${prop} — it must equal the midnight bundle`,
        ).toBe(value);
      }
    }
  });

  it("every light-gated room token carries a dark-media reset (nothing leaks into system-dark)", () => {
    for (const [room, tokens] of lightRooms) {
      const dark = darkRooms.get(room);
      expect(dark, `room ${room} re-binds tokens but has no dark-media reset rule`).toBeDefined();
      for (const prop of tokens.keys()) {
        expect(
          dark!.has(prop),
          `room ${room} re-binds ${prop} in the light gate without a dark-media reset`,
        ).toBe(true);
      }
    }
  });
});
