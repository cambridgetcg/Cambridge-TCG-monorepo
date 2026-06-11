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
    gloss: "The card, given room — ivory ground, editorial serif, art does the talking.",
    entitlement: "free",
    swatches: ["#f7f3ec", "#ffffff", "#211d16", "#9a6b1f"],
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
    gloss: "Members' skin — blue-black ground, moonlight gilt, for reading at 2am.",
    entitlement: "member",
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

/** The default face of migrated surfaces (spec §3.3); the site-wide
 * `:root` flip is §3.6 and lands with the home sweep. */
export const DEFAULT_THEME: ThemeId = "gallery";

export const THEME_COOKIE = "theme";
export const TONE_COOKIE = "tone";

export function isThemeId(value: string | undefined | null): value is ThemeId {
  return !!value && THEMES.some((t) => t.id === value);
}

export function getTheme(id: ThemeId): WardrobeTheme {
  // The registry is exhaustive over ThemeId, so find() cannot miss.
  return THEMES.find((t) => t.id === id)!;
}
