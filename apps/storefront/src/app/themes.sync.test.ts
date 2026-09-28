import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { THEMES, isThemeId, themeAttr } from "@/lib/wardrobe/themes";

const here = dirname(fileURLToPath(import.meta.url));
const css = (name: string) => readFileSync(join(here, name), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const themes = css("themes.css");
const globals = css("globals.css");

function block(source: string, selector: string) {
  const start = source.indexOf(selector);
  if (start < 0) throw new Error(`Missing CSS block: ${selector}`);
  const open = source.indexOf("{", start);
  return source.slice(open + 1, source.indexOf("}", open));
}

function declarations(source: string): Record<string, string> {
  return Object.fromEntries(source.split(";").map((entry) => entry.trim()).filter(Boolean).map((entry) => {
    const colon = entry.indexOf(":");
    return [entry.slice(0, colon).trim(), entry.slice(colon + 1).replace(/\s+/g, " ").trim()];
  }));
}

const bundle = (id: string) => declarations(block(themes, `[data-theme="${id}"] {`));

function luminance(hex: string) {
  if (!/^#[\da-f]{6}$/i.test(hex)) throw new Error(`Contrast fixture must be an opaque hex color: ${hex}`);
  const channels = [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a: string, b: string) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

describe("appearance compatibility and palette consistency", () => {
  it("preserves saved theme IDs and follows the system without a choice", () => {
    expect(THEMES.map((theme) => theme.id)).toEqual(["gallery", "terminal", "midnight", "high-contrast"]);
    expect(themeAttr(null)).toBe("system");
    expect(isThemeId("system")).toBe(false);
    for (const theme of THEMES) {
      expect(isThemeId(theme.id)).toBe(true);
      expect(themeAttr(theme.id)).toBe(theme.id);
      expect(theme.entitlement).toBe("free");
    }
  });

  it("keeps the Light defaults and explicit Light bundle identical", () => {
    const defaults = { ...declarations(block(themes, "@theme")), ...declarations(block(globals, "@theme")) };
    const light = bundle("gallery");
    const { "color-scheme": scheme, ...tokens } = light;
    expect(scheme).toBe("light");
    expect(defaults).toEqual(tokens);
  });

  it("keeps system dark identical to the explicit Dark bundle", () => {
    const darkMedia = themes.slice(themes.indexOf("@media (prefers-color-scheme: dark)"));
    expect(declarations(block(darkMedia, '[data-theme="system"] {'))).toEqual(bundle("midnight"));
    expect(bundle("system")).toEqual({ "color-scheme": "light dark" });
    expect(declarations(block(globals, ":root"))).not.toHaveProperty("color-scheme");
  });

  it("keeps every settings swatch and color-scheme aligned with the CSS", () => {
    for (const theme of THEMES) {
      const tokens = bundle(theme.id);
      expect(theme.swatches).toEqual([tokens["--color-page"], tokens["--color-surface"], tokens["--color-ink"], tokens["--color-accent"]]);
      expect(tokens["color-scheme"]).toBe(theme.scheme);
    }
  });
});

describe("shared text and action contrast", () => {
  const textTokens = ["ink", "ink-muted", "ink-faint", "accent", "accent-strong", "secondary", "danger", "warning", "info", "ok", "bid", "ask"];
  const surfaces = ["page", "surface", "surface-subtle", "surface-elevated"];
  for (const theme of THEMES) {
    it(`${theme.label} keeps normal text readable on each base surface`, () => {
      const tokens = bundle(theme.id);
      for (const text of textTokens) for (const surface of surfaces) {
        expect(contrast(tokens[`--color-${text}`], tokens[`--color-${surface}`]), `${theme.id}: ${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    });

    it(`${theme.label} keeps primary and danger button labels readable`, () => {
      const tokens = bundle(theme.id);
      for (const background of ["ink", "danger"]) {
        expect(contrast(tokens["--color-page"], tokens[`--color-${background}`])).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
