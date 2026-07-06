/**
 * @module @/lib/games/sku-game
 *
 * One truth for SKU → game. Promoted out of `@/lib/tradein/games` (which
 * re-exports for compat) so every surface that infers a game from a SKU —
 * market pages, product pages, portfolio search — reads the same map
 * instead of re-deriving it wrongly.
 *
 * Two SKU regimes coexist in production:
 *   - Legacy prefix-typed uppercase SKUs (the wholesale catalog today):
 *     `PK-SV2A-011-JP-V4K5`, `OP-…`, `FB-…` — the first segment is a
 *     set-family prefix.
 *   - Canonical lowercase SKUs per @cambridge-tcg/sku (kingdom-071):
 *     `<game>-<set>-<number>-<lang>` with game codes op / pkm / dbf.
 *
 * `gameFromSku` resolves both. SEALED- SKUs exist under multiple games,
 * so they can't be derived — returns null and the caller keeps whatever
 * game context it has.
 */

/** The games whose SKUs we can recognise, with display labels and the
 *  official brand names (JSON-LD `brand`, breadcrumbs). Slugs match the
 *  wholesale catalog's /api/v1/games slugs — verified against prod. */
export const SKU_GAMES = [
  {
    slug: "one-piece",
    label: "One Piece",
    brand: "One Piece Card Game",
  },
  {
    slug: "pokemon",
    label: "Pokémon",
    brand: "Pokémon Trading Card Game",
  },
  {
    slug: "dragon-ball",
    label: "Dragon Ball",
    brand: "Dragon Ball Super Card Game Fusion World",
  },
] as const;

export type SkuGameSlug = (typeof SKU_GAMES)[number]["slug"];

export function isSkuGameSlug(game: string): game is SkuGameSlug {
  return SKU_GAMES.some((g) => g.slug === game);
}

/** Official brand name for a game slug (JSON-LD, SEO surfaces). */
export function gameBrand(slug: SkuGameSlug): string {
  return SKU_GAMES.find((g) => g.slug === slug)!.brand;
}

// Legacy prefix-typed SKUs (verified against the live wholesale catalog):
// one-piece uses OP/EB/ST/P/PRB/DON, pokemon PK, dragon-ball FB/SB.
export const PREFIX_TO_GAME: Record<string, SkuGameSlug> = {
  OP: "one-piece",
  EB: "one-piece",
  ST: "one-piece",
  P: "one-piece",
  PRB: "one-piece",
  DON: "one-piece",
  PK: "pokemon",
  FB: "dragon-ball",
  SB: "dragon-ball",
};

// Canonical SKU game codes per packages/sku (lowercase-first segment).
const CODE_TO_GAME: Record<string, SkuGameSlug> = {
  op: "one-piece",
  pkm: "pokemon",
  dbf: "dragon-ball",
};

/**
 * Derive the game slug from a SKU's first segment. Handles both the
 * legacy uppercase prefix regime and canonical lowercase game codes.
 * Returns null when underivable (SEALED-, unknown prefixes).
 */
export function gameFromSku(sku: string): SkuGameSlug | null {
  const prefix = sku.split("-")[0] ?? "";
  return (
    PREFIX_TO_GAME[prefix.toUpperCase()] ??
    CODE_TO_GAME[prefix.toLowerCase()] ??
    null
  );
}
