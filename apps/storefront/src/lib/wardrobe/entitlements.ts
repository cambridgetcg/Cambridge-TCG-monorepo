/**
 * Wardrobe entitlements — which themes a visitor may wear.
 *
 * Spec: docs/superpowers/specs/2026-06-10-the-wardrobe-design.md §3.5.
 * Gating model chosen by Yu (2026-06-10): basics free, skins as perks.
 *
 * 2026-07-06: midnight un-gated (dark mode is table stakes, not a perk).
 * 2026-07-21: memberships removed and Cambridge TCG went fully free — there
 * is no paid tier anymore, and every registry entry is "free", so this
 * module locks nothing for anyone. The `tier` parameter is now always null
 * in practice; the function shape is kept as the honest place a future
 * earned/seasonal skin would slot in, but nothing is gated today.
 *
 * The rule stays simple: every "free" theme is available to everyone,
 * signed-in or not — accessibility choices (high-contrast, text-mode,
 * reduced-motion) are never paywalled.
 *
 * Enforcement is server-side in /api/appearance (the only writer of the
 * theme cookie). A locked id arriving anyway degrades to DEFAULT_THEME —
 * no error theatre over a cosmetic.
 */

import type { Tier } from "@/lib/membership/types";
import { THEMES, type ThemeId, type WardrobeTheme } from "./themes";

export function canWear(theme: WardrobeTheme, tier: Tier | null): boolean {
  if (theme.entitlement === "free") return true;
  return tier?.is_paid === true;
}

export function themesForTier(tier: Tier | null): readonly WardrobeTheme[] {
  return THEMES.filter((t) => canWear(t, tier));
}

export function canWearId(id: ThemeId, tier: Tier | null): boolean {
  const theme = THEMES.find((t) => t.id === id);
  return !!theme && canWear(theme, tier);
}
