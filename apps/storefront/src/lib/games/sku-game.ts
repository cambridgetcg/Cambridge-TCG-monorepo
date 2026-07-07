/**
 * @module @/lib/games/sku-game
 *
 * One truth for SKU → game — now a DERIVATION of the Atlas
 * (packages/sku GAMES; spec 2026-07-07 the-atlas §3). The storefront
 * keeps its literal SkuGameSlug union for type ergonomics; the contract
 * test pins it equal to the Atlas's confirmed slugs, so the union can
 * lag the Atlas only as a failing test, never silently.
 *
 * Two SKU regimes coexist in production:
 *   - Legacy prefix-typed uppercase SKUs (`PK-SV2A-011-JP-V4K5`) — the
 *     frozen founding-trio regime; prefixes live in the Atlas as
 *     `legacyPrefixes`.
 *   - Canonical lowercase SKUs per @cambridge-tcg/sku
 *     (`<game>-<set>-<number>-<lang>`), any registered game code.
 *
 * `gameFromSku` resolves both. SEALED- SKUs exist under multiple games,
 * so they can't be derived — returns null and the caller keeps whatever
 * game context it has.
 */

import {
  GAMES,
  GAME_CODES,
  CONFIRMED_GAME_CODES,
  gameBySlug,
  type GameCode,
} from "@cambridge-tcg/sku";

/** The confirmed games (cards in prod), Atlas-derived: slug + label +
 *  official brand. The literal type union below is pinned to this by
 *  the contract test. */
export const SKU_GAMES = CONFIRMED_GAME_CODES.filter((c) => c !== "tst").map(
  (code) => ({
    slug: GAMES[code].slug as SkuGameSlug,
    label: GAMES[code].name.replace(/ TCG$| Card Game$/, ""),
    brand: GAMES[code].brand,
  }),
);

export type SkuGameSlug = "one-piece" | "pokemon" | "dragon-ball";

export function isSkuGameSlug(game: string): game is SkuGameSlug {
  return SKU_GAMES.some((g) => g.slug === game);
}

/** Official brand name for a game slug (JSON-LD, SEO surfaces) —
 *  Atlas-wide: any registered game's slug resolves (a gundam SKU gets
 *  "GUNDAM CARD GAME", not a One Piece fallback). Unknown slugs echo
 *  back rather than lie. */
export function gameBrand(slug: string): string {
  return gameBySlug(slug)?.brand ?? slug;
}

// Legacy prefix-typed SKUs — Atlas-derived from the frozen
// legacyPrefixes facts (founding trio only, by construction).
export const PREFIX_TO_GAME: Record<string, SkuGameSlug> = Object.fromEntries(
  CONFIRMED_GAME_CODES.flatMap((code) =>
    (GAMES[code].legacyPrefixes ?? []).map((p) => [p, GAMES[code].slug]),
  ),
) as Record<string, SkuGameSlug>;

// Canonical SKU game codes — the FULL Atlas (all registered codes →
// slug), so canonical SKUs of any registered game resolve; downstream
// subsets (weather, tradein, price-guide copy) stay deliberately
// narrower and simply no-op on slugs they don't dress.
const CODE_TO_GAME: Record<string, string> = Object.fromEntries(
  GAME_CODES.map((code: GameCode) => [code, GAMES[code].slug]),
);

/**
 * Derive the game slug from a SKU's first segment. Handles both the
 * legacy uppercase prefix regime and canonical lowercase game codes.
 * Returns null when underivable (SEALED-, unknown prefixes).
 */
export function gameFromSku(sku: string): string | null {
  const prefix = sku.split("-")[0] ?? "";
  return (
    PREFIX_TO_GAME[prefix.toUpperCase()] ??
    CODE_TO_GAME[prefix.toLowerCase()] ??
    null
  );
}
