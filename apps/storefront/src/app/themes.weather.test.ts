/**
 * The game weather materials contract.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md §2/§5.
 * Same file-contract style as themes.manga.test.ts. Promises pinned
 * (hardened by the 2026-07-07 adversarial review batch — every assertion
 * below was mutation-tested; the review found the first draft's positive
 * checks could all be escaped):
 *   1. Every weather class exists, one per WEATHER_GAMES slug (registry sync).
 *   2. THE WEATHER NEVER MOVES — no animation/transition on any
 *      wardrobe-weather rule in EITHER stylesheet.
 *   3. Texture is theme-gated: base ::before carries opacity 0; every one
 *      of gallery/midnight/system raises it to a nonzero value; and NO
 *      un-gated (or otherwise-gated) weather rule raises opacity —
 *      terminal and high-contrast never see the weather.
 *   4. Geometry-only data-URIs: no %23 hex escapes in any weather rule
 *      block, and the weather section sits after the manga marker so the
 *      manga no-hex sweep also covers literal hex here.
 *   5. text-mode kills .wardrobe-weather::before by name.
 *   6. The mask geometry itself is pinned byte-for-byte — the spec's one
 *      legally-loaded hard rule ("no circle-with-band shapes ever") must
 *      not be mutable without a deliberate, reviewable re-pin.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { WEATHER_GAMES } from "@/lib/wardrobe/weather";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8");
const globals = readFileSync(join(here, "globals.css"), "utf8");

const weatherBlocks = (themes.match(/[^{}]*\{[^}]*\}/g) ?? []).filter((b) =>
  b.includes("wardrobe-weather"),
);

/* The two mask tiles, decoded — copied verbatim from themes.css. A glyph
 * change here is a deliberate act with the IP rule in front of you:
 * plain arcs (seigaiha + the y=42 guard row), a teardrop, a vesica leaf
 * with midrib, a four-point sparkle. No circles, no ellipses, no bands. */
const ONE_PIECE_MASK =
  "<svg xmlns='http://www.w3.org/2000/svg' width='56' height='28'><g fill='none' stroke='black' stroke-width='1'><path d='M-14 14 A14 14 0 0 1 14 14 M-9.5 14 A9.5 9.5 0 0 1 9.5 14 M-5 14 A5 5 0 0 1 5 14'/><path d='M14 14 A14 14 0 0 1 42 14 M18.5 14 A9.5 9.5 0 0 1 37.5 14 M23 14 A5 5 0 0 1 33 14'/><path d='M42 14 A14 14 0 0 1 70 14 M46.5 14 A9.5 9.5 0 0 1 65.5 14 M51 14 A5 5 0 0 1 61 14'/><path d='M0 28 A14 14 0 0 1 28 28 M4.5 28 A9.5 9.5 0 0 1 23.5 28 M9 28 A5 5 0 0 1 19 28'/><path d='M28 28 A14 14 0 0 1 56 28 M32.5 28 A9.5 9.5 0 0 1 51.5 28 M37 28 A5 5 0 0 1 47 28'/><path d='M-14 42 A14 14 0 0 1 14 42 M14 42 A14 14 0 0 1 42 42 M42 42 A14 14 0 0 1 70 42'/></g></svg>";
const POKEMON_MASK =
  "<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><g fill='none' stroke='black' stroke-width='1'><path d='M14 8 C17 12 20 15 20 18 A6 6 0 1 1 8 18 C8 15 11 12 14 8 Z'/><path d='M40 34 Q47 27 54 34 Q47 41 40 34 Z M43 34 L51 34'/><path d='M18 46 L19.5 51.5 L25 53 L19.5 54.5 L18 60 L16.5 54.5 L11 53 L16.5 51.5 Z'/></g></svg>";

describe("the game weather materials (spec 2026-07-07)", () => {
  it("defines the material and one variant per game", () => {
    expect(themes).toMatch(/\.wardrobe-weather[\s,{:\[]/);
    for (const slug of WEATHER_GAMES) {
      expect(themes, `missing .wardrobe-weather--${slug}`).toMatch(
        new RegExp(`\\.wardrobe-weather--${slug}[\\s,{:\\[]`),
      );
    }
  });

  it("never moves — no animation or transition on any weather rule", () => {
    // Both stylesheets: the feature's rules live in themes.css AND
    // globals.css (the text-mode kill) — a "smooth the theme switch"
    // transition added to either would break the layer's one hard promise.
    for (const sheet of [themes, globals]) {
      const blocks = sheet.match(/[^{}]*\{[^}]*\}/g) ?? [];
      for (const block of blocks) {
        if (!block.includes("wardrobe-weather")) continue;
        expect(block, "the weather moved").not.toMatch(/animation|transition/);
      }
    }
  });

  it("keeps the base texture invisible and gates volume by theme", () => {
    const base = themes.match(
      /(^|\n)\.wardrobe-weather::before[^,{]*\{([^}]*)\}/m,
    );
    expect(base, "base ::before rule missing").not.toBeNull();
    expect(base![2]).toMatch(/opacity:\s*0[;\s]/);
    // Each of the three dressed themes raises the volume to nonzero —
    // a deleted gate (weather silently dead in one theme) or an
    // all-zeroed gate (dead code shipping) must fail.
    for (const theme of ["gallery", "midnight", "system"]) {
      expect(themes, `weather not raised under ${theme}`).toMatch(
        new RegExp(
          `\\[data-theme="${theme}"\\][^{]*\\.wardrobe-weather::before[^{]*\\{[^}]*opacity:\\s*0?\\.\\d`,
        ),
      );
    }
    // …and ONLY those three: any weather block that raises opacity to a
    // nonzero value must carry one of the allowed gates in its SELECTOR
    // (terminal/high-contrast must never see the weather).
    for (const block of weatherBlocks) {
      const [selector, body] = block.split("{");
      const m = body.match(/opacity:\s*([\d.]+)/);
      if (!m || Number(m[1]) === 0) continue;
      expect(
        selector,
        `weather opacity raised outside a theme gate: ${selector.trim()}`,
      ).toMatch(/\[data-theme="(gallery|midnight|system)"\]/);
    }
  });

  it("carries geometry-only data-URIs — no encoded hex color", () => {
    // Anchored to the RULES, not to a comment marker: every weather
    // block, wherever it sits, must be free of %23 hex escapes.
    expect(weatherBlocks.length, "no weather rules found").toBeGreaterThan(0);
    for (const block of weatherBlocks) {
      expect(block, "weather rule carries encoded hex").not.toContain("%23");
    }
    // Spec §5: the section sits after the manga marker, so the manga
    // no-hex sweep (which slices marker→EOF) also covers literal hex here.
    const start = themes.indexOf("── The game weather");
    expect(start, "weather section marker missing").toBeGreaterThan(-1);
    expect(
      start,
      "weather section must sit after the manga marker (spec §5)",
    ).toBeGreaterThan(themes.indexOf("── Manga materials"));
  });

  it("text-mode kills the weather by name", () => {
    expect(globals).toMatch(
      /body\.text-mode[^{]*\.wardrobe-weather::before[^{]*\{[^}]*content:\s*none/,
    );
  });

  it("pins the mask geometry — no circle-with-band, ever (spec §1)", () => {
    const section = themes.slice(themes.indexOf("── The game weather"));
    const uris = [...section.matchAll(/url\("(data:image\/svg\+xml,[^"]+)"\)/g)]
      .map((m) => decodeURIComponent(m[1].replace("data:image/svg+xml,", "")));
    // 2 glyph tiles × (-webkit- + standard) — one-piece and pokemon;
    // dragon-ball is a gradient and carries no URI.
    expect(uris).toHaveLength(4);
    expect(new Set(uris).size).toBe(2);
    for (const svg of uris) {
      expect(svg, "closed round shape crept into a mask").not.toMatch(
        /<circle|<ellipse/i,
      );
    }
    // Byte-for-byte: any geometry change forces a deliberate re-pin.
    expect([...new Set(uris)].sort()).toEqual(
      [ONE_PIECE_MASK, POKEMON_MASK].sort(),
    );
  });
});
