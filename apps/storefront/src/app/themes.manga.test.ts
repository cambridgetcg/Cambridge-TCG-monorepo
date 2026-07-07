/**
 * The manga materials contract.
 *
 * Spec: docs/superpowers/specs/2026-07-07-the-manga-gallery-design.md §1.
 * Same testing style as themes.sync.test.ts: parse the stylesheet, pin
 * the load-bearing promises so drift is caught by vitest, not by eyes.
 *
 * Promises pinned here:
 *   1. Every manga material class exists in themes.css.
 *   2. Every ANIMATED material is theme-gated (gallery/midnight/system)
 *      — terminal and high-contrast never animate the manga layer.
 *   3. The manga section introduces no raw hex colors — tokens,
 *      color-mix of tokens, currentColor and transparent only.
 *   4. globals.css text-mode kills every manga animation and every
 *      manga pseudo-element texture by name (the universal `*` flatten
 *      does not reach ::before/::after).
 */
import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8");
const globals = readFileSync(join(here, "globals.css"), "utf8");

const MATERIALS = [
  "wardrobe-breathe",
  "wardrobe-draw",
  "wardrobe-tone-whisper",
  "wardrobe-tone-fade",
  "wardrobe-panel",
  "wardrobe-speedlines",
  "wardrobe-bob",
  "wardrobe-aura",
] as const;

const ANIMATED = [
  "wardrobe-breathe",
  "wardrobe-draw",
  "wardrobe-speedlines",
  "wardrobe-bob",
] as const;

describe("manga materials (spec 2026-07-07 §1)", () => {
  it("defines every material class", () => {
    for (const cls of MATERIALS) {
      expect(themes, `missing .${cls}`).toMatch(new RegExp(`\\.${cls}[\\s,{:\\[]`));
    }
  });

  it("theme-gates every animated material", () => {
    for (const cls of ANIMATED) {
      // The animation binding must appear behind a [data-theme=...] gate,
      // never on the bare class (terminal/high-contrast stay still).
      const gated = new RegExp(
        `\\[data-theme="(gallery|midnight|system)"\\][^{]*\\.${cls}[^{]*\\{[^}]*animation`,
      );
      expect(themes, `.${cls} animation is not theme-gated`).toMatch(gated);
      const bare = new RegExp(`(^|\\n)\\s*\\.${cls}[^,{]*\\{[^}]*animation(-name)?\\s*:`, "m");
      expect(themes, `.${cls} binds animation outside a theme gate`).not.toMatch(bare);
    }
  });

  it("uses no raw hex in the manga section", () => {
    const start = themes.indexOf("── Manga materials");
    expect(start, "manga section marker missing").toBeGreaterThan(-1);
    const section = themes.slice(start);
    const stripped = section.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(stripped).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("text-mode kills manga animation and pseudo-element textures", () => {
    for (const cls of ANIMATED) {
      expect(globals, `text-mode does not kill .${cls}`).toMatch(
        new RegExp(`body\\.text-mode[^{]*\\.${cls}`),
      );
    }
    expect(globals).toMatch(/body\.text-mode[^{]*\.wardrobe-speedlines::before/);
    expect(globals).toMatch(/body\.text-mode[^{]*\.wardrobe-aura::before/);
    const toneKill = /body\.text-mode[^{]*\.wardrobe-tone-fade[^{]*\{[^}]*mask-image:\s*none/;
    expect(globals, "text-mode does not kill the tone-fade mask").toMatch(toneKill);
  });
});
