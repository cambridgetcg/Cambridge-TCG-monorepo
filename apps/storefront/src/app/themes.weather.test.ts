/**
 * The game weather materials contract.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-game-weather-design.md §2/§5.
 * Same file-contract style as themes.manga.test.ts. Promises pinned:
 *   1. Every weather class exists, one per WEATHER_GAMES slug (registry sync).
 *   2. THE WEATHER NEVER MOVES — no animation/transition on any
 *      wardrobe-weather rule.
 *   3. Texture is theme-gated: base ::before carries opacity 0; opacity is
 *      raised only inside gallery/midnight/system gates.
 *   4. Geometry-only data-URIs: no %23 hex escapes (the manga section's
 *      no-raw-hex sweep already covers literal hex).
 *   5. text-mode kills .wardrobe-weather::before by name.
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { WEATHER_GAMES } from "@/lib/wardrobe/weather";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8");
const globals = readFileSync(join(here, "globals.css"), "utf8");

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
    const blocks = themes.match(/[^{}]*\{[^}]*\}/g) ?? [];
    for (const block of blocks) {
      if (!block.includes("wardrobe-weather")) continue;
      expect(block, "the weather moved").not.toMatch(/animation|transition/);
    }
  });

  it("keeps the base texture invisible and gates volume by theme", () => {
    const base = themes.match(
      /(^|\n)\.wardrobe-weather::before[^,{]*\{([^}]*)\}/m,
    );
    expect(base, "base ::before rule missing").not.toBeNull();
    expect(base![2]).toMatch(/opacity:\s*0[;\s]/);
    expect(themes).toMatch(
      /\[data-theme="(gallery|midnight|system)"\][^{]*\.wardrobe-weather::before[^{]*\{[^}]*opacity/,
    );
  });

  it("carries geometry-only data-URIs — no encoded hex color", () => {
    const start = themes.indexOf("── The game weather");
    expect(start, "weather section marker missing").toBeGreaterThan(-1);
    expect(themes.slice(start)).not.toContain("%23");
  });

  it("text-mode kills the weather by name", () => {
    expect(globals).toMatch(
      /body\.text-mode[^{]*\.wardrobe-weather::before[^{]*\{[^}]*content:\s*none/,
    );
  });
});
