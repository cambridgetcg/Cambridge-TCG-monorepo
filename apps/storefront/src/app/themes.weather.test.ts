/** Game metadata stays independent from the removed decorative weather layer. */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WEATHER_GAMES, weatherClass } from "@/lib/wardrobe/weather";

const here = dirname(fileURLToPath(import.meta.url));
const themes = readFileSync(join(here, "themes.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

describe("static game presentation", () => {
  it("keeps game hooks available without painting pseudo-element textures", () => {
    for (const slug of WEATHER_GAMES) {
      expect(weatherClass(slug)).toContain(`wardrobe-weather--${slug}`);
    }
    expect(themes).not.toMatch(/\.wardrobe-weather[^{}]*\{/);
    expect(themes).not.toContain("data:image/svg+xml");
  });
});
