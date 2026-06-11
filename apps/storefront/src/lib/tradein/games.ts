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

// SKUs are prefix-typed (verified against the live wholesale catalog):
// one-piece uses OP/EB/ST/P/PRB/DON, pokemon PK, dragon-ball FB/SB.
// SEALED- SKUs exist under multiple games, so they can't be derived —
// returns null and the caller keeps whatever game context it has.
const PREFIX_TO_GAME: Record<string, TradeinGameSlug> = {
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

export function gameFromSku(sku: string): TradeinGameSlug | null {
  return PREFIX_TO_GAME[sku.split("-")[0]] ?? null;
}
