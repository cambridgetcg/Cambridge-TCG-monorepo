/**
 * The browser bar follows the theme <html> wears (viewport.ts). The
 * swatches and schemes it reads are held to themes.css by
 * src/app/themes.sync.test.ts.
 */
import { describe, expect, it } from "vitest";
import { getTheme, THEMES } from "./themes";
import { themeViewport } from "./viewport";

describe("the theme's viewport", () => {
  it("gives a visitor with no saved theme the kit's pair and both schemes", () => {
    expect(themeViewport(null)).toEqual({
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: "#FBF7F1" },
        { media: "(prefers-color-scheme: dark)", color: "#1D1425" },
      ],
      colorScheme: "light dark",
    });
  });

  // "system" wears Light values in a light scheme and Dark values in a dark
  // one, so the pair must be those two page grounds.
  it("pairs the Light and Dark page grounds, as system resolves them", () => {
    const pair = themeViewport(null).themeColor as { color: string }[];
    expect(pair.map(({ color }) => color.toLowerCase())).toEqual([
      getTheme("gallery").swatches[0],
      getTheme("midnight").swatches[0],
    ]);
  });

  it("gives a saved theme its own page ground as one colour, and its own scheme", () => {
    expect(Object.fromEntries(THEMES.map((theme) => [theme.id, themeViewport(theme.id)]))).toEqual({
      gallery: { themeColor: "#fbf7f1", colorScheme: "light" },
      terminal: { themeColor: "#0a0a0a", colorScheme: "dark" },
      midnight: { themeColor: "#1d1425", colorScheme: "dark" },
      "high-contrast": { themeColor: "#ffffff", colorScheme: "light" },
    });
  });
});
