/**
 * @module @/lib/wardrobe/viewport
 *
 * What the browser wears around the page: the theme-color that tints its
 * bar and the color-scheme its own controls follow. The root layout's
 * generateViewport() writes it on every render, and the lights flip
 * (flip.ts) rewrites the same tags when it changes the theme in place, and
 * again when a cached route's head would undo that, so the bar matches the
 * page either way.
 *
 * With no saved theme the page follows the device (themes.css,
 * [data-theme="system"]), and so does the bar: the Light and Dark page
 * grounds as a pair, read from the registry so a palette change carries
 * through (the brand kit's head-snippet.html pair is the same two grounds).
 * A saved theme can disagree with the device (Dark on a light phone), so it
 * gets its own page ground as one colour and its own scheme.
 */

import { getTheme, type ThemeId } from "./themes";

export interface ThemeViewport {
  /** One colour, or one per prefers-color-scheme. */
  themeColor: string | { media: string; color: string }[];
  colorScheme: "light" | "dark" | "light dark";
}

/** The viewport for a visitor's theme: null means no saved choice (system). */
export function themeViewport(theme: ThemeId | null): ThemeViewport {
  if (!theme) {
    return {
      themeColor: [
        { media: "(prefers-color-scheme: light)", color: getTheme("gallery").swatches[0] },
        { media: "(prefers-color-scheme: dark)", color: getTheme("midnight").swatches[0] },
      ],
      colorScheme: "light dark",
    };
  }
  const { swatches, scheme } = getTheme(theme);
  return { themeColor: swatches[0], colorScheme: scheme };
}
