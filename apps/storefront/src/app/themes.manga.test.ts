/** Existing material class names remain usable after the plain UI redesign. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(join(here, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const themes = read("themes.css");
const globals = read("globals.css");

describe("plain shared materials", () => {
  it("keeps existing surface and divider hooks usable", () => {
    for (const name of ["ground", "wall", "mat", "frame", "panel", "draw", "breathe", "jp"]) {
      expect(themes).toMatch(new RegExp(`\\.wardrobe-${name}[\\s,{:]`));
    }
    expect(themes).toMatch(/\.wardrobe-draw\s*\{[^}]*height:\s*1px/);
  });

  it("does not animate or texture shared appearance", () => {
    expect(themes).not.toMatch(/@keyframes|animation(?:-timeline)?\s*:|transform\s*:|(?:radial|linear|conic)-gradient\(|data:image/);
    expect(themes).not.toMatch(/\.wardrobe-wall--[\w-]+\s*\{/);
  });

  it("keeps the native close-look dialog and its scroll lock", () => {
    expect(themes).toMatch(/\.wardrobe-closelook::backdrop\s*\{[^}]*background:\s*var\(--color-scrim\)/);
    expect(themes).toMatch(/body:has\(dialog\.wardrobe-closelook\[open\]\)\s*\{[^}]*overflow:\s*hidden/);
    expect(themes).toMatch(/\.wardrobe-closelook\s*\{[^}]*max-height:\s*92vh/);
    expect(themes).not.toMatch(/outline:\s*none/);
  });

  it("preserves keyboard focus, explicit text mode and reduced motion", () => {
    expect(globals).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--color-accent\)/);
    expect(globals).toMatch(/body\.text-mode\s*\{[^}]*color-scheme:\s*light/);
    expect(globals).toMatch(/body\.text-mode :focus-visible\s*\{[^}]*outline-color:\s*black !important/);
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("scroll-behavior: auto !important");
  });
});
