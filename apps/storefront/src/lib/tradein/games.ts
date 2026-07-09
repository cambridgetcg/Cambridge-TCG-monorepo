// Games the buylist trades in. Slugs must match the wholesale API's
// /api/v1/games slugs — they are passed verbatim as the ?game= param.
export const TRADEIN_GAMES = [
  { slug: "one-piece", label: "One Piece" },
  { slug: "pokemon", label: "Pokémon" },
  { slug: "dragon-ball", label: "Dragon Ball" },
] as const;

export type TradeinGameSlug = (typeof TRADEIN_GAMES)[number]["slug"];

export function isTradeinGame(game: string): game is TradeinGameSlug {
  return TRADEIN_GAMES.some((g) => g.slug === game);
}

export function gameLabel(slug: string): string {
  return TRADEIN_GAMES.find((g) => g.slug === slug)?.label ?? slug;
}

// SKU → game derivation lives in one shared place now — the map was
// promoted to @/lib/games/sku-game so product pages, portfolio search,
// and trade-in all read the same truth. Re-exported here for compat.
export { PREFIX_TO_GAME, gameFromSku } from "@/lib/games/sku-game";
