/**
 * Wardrobe server helpers — read the visitor's appearance from cookies.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md §3.2.
 * Mirrors the displayCurrencyFromCookies() pattern (lib/fx): a pure
 * function over an already-awaited cookie store, so layouts and pages
 * read once per request and thread the result down.
 *
 * `theme` is null when the visitor has never chosen — migrated surfaces
 * then default to DEFAULT_THEME on their own wrapper (spec §3.3) while
 * `:root` stays terminal until the flip (§3.6).
 */

import type { cookies } from "next/headers";
import { isThemeId, THEME_COOKIE, TONE_COOKIE, type ThemeId } from "./themes";
import { DEFAULT_TONE, isToneId, type ToneId } from "./voice";

type CookieStore = Awaited<ReturnType<typeof cookies>>;

export interface Appearance {
  /** Explicit visitor choice, or null when they never picked. */
  theme: ThemeId | null;
  tone: ToneId;
}

export function appearanceFromCookies(store: CookieStore): Appearance {
  const themeRaw = store.get(THEME_COOKIE)?.value;
  const toneRaw = store.get(TONE_COOKIE)?.value;
  return {
    theme: isThemeId(themeRaw) ? themeRaw : null,
    tone: isToneId(toneRaw) ? toneRaw : DEFAULT_TONE,
  };
}
