/**
 * The browser bar follows the theme <html> wears (viewport.ts). The
 * swatches and schemes it reads are held to themes.css by
 * src/app/themes.sync.test.ts.
 */
import { describe, expect, it } from "vitest";
import { getTheme, THEMES } from "./themes";
import { themeViewport } from "./viewport";

describe("the theme's viewport", () => {
  // "system" wears Light values in a light scheme and Dark values in a dark
  // one, so the pair is those two page grounds.
  it("gives a visitor with no saved theme the Light and Dark grounds as a pair, and both schemes", () => {
    expect(themeViewport(null)).toEqual({
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: getTheme("gallery").swatches[0] },
        { media: "(prefers-color-scheme: dark)", color: getTheme("midnight").swatches[0] },
      ],
      colorScheme: "light dark",
    });
    expect(themeViewport(null).themeColor).toEqual([
      { media: "(prefers-color-scheme: light)", color: "#faf8f4" },
      { media: "(prefers-color-scheme: dark)", color: "#0b0f1a" },
    ]);
  });

  it("gives a saved theme its own page ground as one colour, and its own scheme", () => {
    expect(Object.fromEntries(THEMES.map((theme) => [theme.id, themeViewport(theme.id)]))).toEqual({
      gallery: { themeColor: "#faf8f4", colorScheme: "light" },
      terminal: { themeColor: "#0a0a0a", colorScheme: "dark" },
      midnight: { themeColor: "#0b0f1a", colorScheme: "dark" },
      "high-contrast": { themeColor: "#ffffff", colorScheme: "light" },
    });
  });
});
