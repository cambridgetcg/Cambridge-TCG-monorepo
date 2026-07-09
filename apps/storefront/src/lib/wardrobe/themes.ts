/**
 * The Wardrobe — typed registry of the storefront's appearance themes.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md
 * CSS bundles: src/app/themes.css (one [data-theme] block per entry here)
 *
 * The registry is the single source of truth for ids, labels, glosses and
 * entitlements. The CSS carries the values; this module carries the
 * *meaning* — which themes exist, who may wear them, and how the settings
 * surface should present them (swatches are display projections of the
 * CSS bundles, kept in sync by the audit in §5 of the spec).
 *
 * Cosmology note: this is the kingdom's first modelling of the
 * "audience-side opt-out" and "resolution-as-grammar" axes
 * (docs/principles/cosmology.md) — the reader chooses the reading.
 */

export type ThemeId = "gallery" | "terminal" | "midnight" | "high-contrast";
export type ThemeEntitlement = "free" | "member";

/**
 * The fifth choice — not a bundle, a deferral. "system" is what <html>
 * wears when the visitor has never chosen (or chose to follow their OS):
 * gallery values in a light colour scheme, midnight values in a dark one,
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
    label: "Gallery",
    gloss: "The manga page — ink on warm paper, screentone light; the cards are the panels.",
    entitlement: "free",
    swatches: ["#faf8f4", "#ffffff", "#201d18", "#96762f"],
    scheme: "light",
  },
  {
    id: "terminal",
    label: "Terminal",
    gloss: "The trading floor — dark, dense, amber on black. The original look, kept.",
    entitlement: "free",
    swatches: ["#0a0a0a", "#171717", "#ededed", "#f59e0b"],
    scheme: "dark",
  },
  {
    id: "midnight",
    label: "Midnight",
    gloss: "The quiet gallery, lights off — blue-black ground, moonlight gilt, for reading at 2am.",
    // Un-gated 2026-07-06: dark mode is table stakes, not a perk. The
    // entitlement mechanism stays for a future skin that may earn a lock.
    entitlement: "free",
    swatches: ["#0b0f1a", "#121829", "#e9e4d6", "#d9b36c"],
    scheme: "dark",
  },
  {
    id: "high-contrast",
    label: "High contrast",
    gloss: "Maximum legibility — pure black on white, hard borders. Always free.",
    entitlement: "free",
    swatches: ["#ffffff", "#f2f2f2", "#000000", "#00309f"],
    scheme: "light",
  },
] as const;

/** The default *bundle* — the light face of the site since the flip
 * (spec §3.6, fired 2026-07-05 with the quiet gallery). Since 2026-07-06
 * a no-cookie visitor no longer gets this unconditionally: <html> carries
 * `data-theme="system"` (see themeAttr), which resolves to gallery in a
 * light OS and midnight in a dark one. An explicit cookie choice still
 * wins exactly as before. */
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
