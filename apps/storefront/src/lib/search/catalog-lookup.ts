import { GAMES, type GameCode, resolveGameToken, skuIdentity } from "@cambridge-tcg/sku";
import { fetchGames, fetchPrices, type PricesResponse } from "@/lib/wholesale/client";

export interface SearchCandidates extends PricesResponse {
  /** More provider candidates may exist beyond this bounded page. */
  truncated: boolean;
}

/** Resolve the caller's game before retrieving candidates. Set codes are not
 * globally unique, so a set lookup must never override the requested game. */
export async function fetchSearchCandidates(args: {
  game: GameCode;
  q: string;
  limit: number;
}): Promise<SearchCandidates> {
  const games = await fetchGames().catch(() => []);
  const registered = games.filter((game) =>
    [game.code, game.slug, game.name].some((token) => resolveGameToken(token) === args.game));
  const aliases = [...new Set([
    ...registered.flatMap((game) => [game.code, game.slug])
      .filter((token) => resolveGameToken(token) === args.game),
    GAMES[args.game].slug, args.game,
  ])].slice(0, 8);
  let empty: SearchCandidates = { count: 0, total: 0, channel: "", items: [], truncated: false };
  let unavailable = false;
  for (const game of aliases) {
    const result = await fetchPrices({ game, q: args.q, limit: args.limit }).catch(() => ({
      count: 0, total: 0, channel: "", items: [], source: "unavailable" as const,
    }));
    if (result.source === "unavailable") {
      unavailable = true;
      continue;
    }
    const truncated = !Number.isSafeInteger(result.total) || result.total !== result.items.length;
    const items = result.items.filter((row) => skuIdentity(row.sku)?.game === args.game);
    if (items.length > 0) return { ...result, items, count: items.length, truncated };
    empty = { ...result, count: 0, items: [], truncated: empty.truncated || truncated };
  }
  // Do not turn a failed candidate lookup into a claim that no cards exist.
  return unavailable ? { ...empty, source: "unavailable" } : empty;
}
