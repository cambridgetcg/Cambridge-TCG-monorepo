/**
 * Appearance registry: stable cookie IDs, plain labels and CSS swatches.
 * The historical IDs gallery/midnight now label Light/Dark; existing
 * saved choices remain valid. themes.sync.test.ts checks the CSS values.
 */

export type ThemeId = "gallery" | "terminal" | "midnight" | "high-contrast";
export type ThemeEntitlement = "free" | "member";

/**
 * The fifth choice — not a bundle, a deferral. "system" is what <html>
 * wears when the visitor has never chosen (or chose to follow their OS):
 * Light values in a light colour scheme, Dark values in a dark one,
 * resolved by CSS at first paint (themes.css, sync-guarded by
 * src/app/themes.sync.test.ts). It is deliberately NOT a ThemeId —
 * isThemeId() must keep rejecting it so no swatch, entitlement check, or
 * cookie write ever treats it as a wearable bundle.
 */
export const SYSTEM_THEME = "system" as const;
export type ThemeChoice = ThemeId | typeof SYSTEM_THEME;

/** What <html data-theme> should carry: the explicit choice, else system-follow. */
export function themeAttr(theme: ThemeId | null): ThemeChoice {
  return theme ?? SYSTEM_THEME;
}

export interface WardrobeTheme {
  id: ThemeId;
  label: string;
  /** One-sentence gloss shown on the settings surface. */
  gloss: string;
  entitlement: ThemeEntitlement;
  /** Display swatches for the settings cards: [ground, surface, ink, accent]. */
  swatches: [string, string, string, string];
  /** Form-control hint; mirrors the bundle's color-scheme. */
  scheme: "light" | "dark";
}

export const THEMES: readonly WardrobeTheme[] = [
  {
    id: "gallery",
    label: "Light",
    gloss: "Warm ivory, plum text and mandarin accents.",
    entitlement: "free",
    swatches: ["#fbf7f1", "#fffdf9", "#2c1836", "#9b3b12"],
    scheme: "light",
  },
  {
    id: "terminal",
    label: "Terminal",
    gloss: "Light text with amber links on a black background.",
    entitlement: "free",
    swatches: ["#0a0a0a", "#171717", "#ededed", "#f59e0b"],
    scheme: "dark",
  },
  {
    id: "midnight",
    label: "Dark",
    gloss: "Deep plum, warm light text and mandarin accents.",
    // Un-gated 2026-07-06: dark mode is table stakes, not a perk. The
    // entitlement mechanism stays for a future skin that may earn a lock.
    entitlement: "free",
    swatches: ["#1d1425", "#291e32", "#fff6e9", "#ffb078"],
    scheme: "dark",
  },
  {
    id: "high-contrast",
    label: "High contrast",
    gloss: "Maximum legibility — pure black on white, hard borders. Always free.",
    entitlement: "free",
    swatches: ["#ffffff", "#ffffff", "#000000", "#00309f"],
    scheme: "light",
  },
] as const;

/** Default light bundle. The absence of a cookie still follows the system,
 * rather than forcing this bundle on a visitor with a dark preference. */
export const DEFAULT_THEME: ThemeId = "gallery";

export const THEME_COOKIE = "theme";
export const TONE_COOKIE = "tone";

/** True only for wearable bundles — "system" is deliberately not one. */
export function isThemeId(value: string | undefined | null): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}

export function getTheme(id: ThemeId): WardrobeTheme {
  // The registry is exhaustive over ThemeId, so find() cannot miss.
  return THEMES.find((t) => t.id === id)!;
}
