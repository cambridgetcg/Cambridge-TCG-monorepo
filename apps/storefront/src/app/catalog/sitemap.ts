import type { MetadataRoute } from "next";
import { unstable_cache } from "next/cache";
import { connection } from "next/server";
import { loadCatalogSitemap } from "@/lib/catalog-sitemap";
import { getNamedHands } from "@/lib/cards/artists";
import { fetchGamesDetailed, fetchPrices, fetchSetsDetailed } from "@/lib/wholesale/client";

// Cache successful data generations, not a source-dependent build artifact.
// Next's Data Cache retains the last success when background revalidation throws;
// an uncached failure still propagates as a non-200 response, never [] or partial URLs.
const cachedCatalogSitemap = unstable_cache(
  () => loadCatalogSitemap({
    games: fetchGamesDetailed, sets: fetchSetsDetailed, prices: fetchPrices, artists: getNamedHands,
  }),
  ["catalog-sitemap-v1"],
  { revalidate: 3600 },
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Outside the cache scope: stop prerendering before any source read. CI builds
  // need no catalog credentials; an incoming request may populate the Data Cache.
  await connection();
  return cachedCatalogSitemap();
}
