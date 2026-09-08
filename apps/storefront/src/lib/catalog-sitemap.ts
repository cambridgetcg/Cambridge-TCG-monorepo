import type { MetadataRoute } from "next";
import type { getNamedHands } from "./cards/artists";
import type {
  fetchGamesDetailed, fetchPrices, fetchSetsDetailed, WholesaleSource,
} from "./wholesale/client";

export class CatalogSitemapUnavailableError extends Error {
  constructor(readonly source: string, cause?: unknown) {
    super(`Catalog sitemap source unavailable: ${source}`, { cause });
    this.name = "CatalogSitemapUnavailableError";
  }
}

// Dependencies are explicit for controlled fixtures. The runtime uses the existing
// catalog readers; this module adds no source, persisted fallback or memory cache.
export interface CatalogSitemapReaders {
  games: typeof fetchGamesDetailed;
  sets: typeof fetchSetsDetailed;
  prices: typeof fetchPrices;
  artists: typeof getNamedHands;
}
async function read<T>(name: string, load: () => Promise<T>): Promise<T> {
  try { return await load(); }
  catch (cause) { throw new CatalogSitemapUnavailableError(name, cause); }
}

function requireAvailable(name: string, source: WholesaleSource | undefined): void {
  // An unstamped empty response is not evidence of an empty catalog either.
  if (source !== "wholesale-api" && source !== "wholesale-db") {
    throw new CatalogSitemapUnavailableError(name);
  }
}

export async function loadCatalogSitemap(source: CatalogSitemapReaders): Promise<MetadataRoute.Sitemap> {
  const base = "https://cambridgetcg.com";
  const games = await read("games", () => source.games());
  requireAvailable("games", games.source);
  const pages: MetadataRoute.Sitemap = [];
  // Deliberately bounded at 500 products/game, preserving the previous sampling.
  // Preserve parallel game reads rather than accumulating every timeout serially.
  const gamePages = await Promise.all(games.games.map(async (game) => {
    const pages: MetadataRoute.Sitemap = [];
    const slug = encodeURIComponent(game.slug);
    const sets = await read(`sets:${game.slug}`, () => source.sets(game.slug));
    requireAvailable(`sets:${game.slug}`, sets.source);
    const products = await read(`products:${game.slug}`, () => source.prices({
      game: game.slug, limit: 500, sort: "number_asc",
    }));
    requireAvailable(`products:${game.slug}`, products.source);
    pages.push({ url: `${base}/prices/${slug}` });
    for (const set of sets.sets) {
      pages.push({ url: `${base}/prices/${slug}/${encodeURIComponent(set.code.toLowerCase())}` });
    }
    for (const item of products.items.slice(0, 500)) {
      const sku = encodeURIComponent(item.sku);
      pages.push({ url: `${base}/product/${sku}` }, { url: `${base}/market/${sku}` });
    }
    return pages;
  }));
  pages.push(...gamePages.flat());
  // The artist reader rejects on query failure; [] is a successful empty result.
  const artists = await read("artists", () => source.artists());
  for (const hand of artists) pages.push({ url: `${base}/artists/${encodeURIComponent(hand.slug)}` });
  // Catalog timestamps describe upstream rows, not all content of these pages.
  // No lastModified is invented from updated_at, release_date or request time.
  return [...new Map(pages.map((page) => [page.url, page])).values()];
}
