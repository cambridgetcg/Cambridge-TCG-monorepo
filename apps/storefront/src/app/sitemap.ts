import type { MetadataRoute } from "next";
import { fetchGames, fetchPrices, fetchSets } from "@/lib/wholesale/client";
import { GUIDES } from "@/lib/guides";

// The sitemap fans out to the live wholesale API (games/sets/prices) —
// without ISR every crawler hit paid that fan-out, observed at 5-8s cold.
// Hourly regeneration matches the most volatile changeFrequency declared
// below; crawlers get a sub-second cached document.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://cambridgetcg.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/catalog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/market`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/auctions`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${baseUrl}/rewards`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/community`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/prices`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    // kingdom-082 hospitality surfaces — first-class crawlable.
    { url: `${baseUrl}/agents`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/scrapers`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.9 },
    { url: `${baseUrl}/agents/guides`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/welcome-all`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/platform`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/intro`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/data`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/api`, lastModified: new Date(), changeFrequency: "weekly", priority: 0.7 },
    // Contact-surface spec W1/W6 — the human front door + trust pages.
    { url: `${baseUrl}/start`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
    { url: `${baseUrl}/welcome`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/find`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.7 },
    { url: `${baseUrl}/contact`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/privacy`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/terms`, lastModified: new Date(), changeFrequency: "yearly", priority: 0.3 },
  ];

  // Per-guide HTML pages — discoverable via sitemap.
  const guidePages: MetadataRoute.Sitemap = GUIDES.map((g) => ({
    url: `${baseUrl}/agents/guides/${g.slug}`,
    lastModified: new Date(g.last_verified),
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Per-game landing pages — one URL per game in the wholesale catalog.
  // kingdom-084: replaces the hardcoded /prices/one-piece line.
  const games = await fetchGames().catch(() => []);
  const gameLandingPages: MetadataRoute.Sitemap = games.map((g) => ({
    url: `${baseUrl}/prices/${g.slug}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  // Per-set pages — iterate every game × its sets.
  const setPages: MetadataRoute.Sitemap = (
    await Promise.all(
      games.map(async (g) => {
        const sets = await fetchSets(g.slug).catch(() => []);
        return sets.map((set) => ({
          url: `${baseUrl}/prices/${g.slug}/${set.code.toLowerCase()}`,
          lastModified: new Date(),
          changeFrequency: "daily" as const,
          priority: 0.7,
        }));
      }),
    )
  ).flat();

  // Top cards across every game — capped per-game so the sitemap stays
  // bounded as the catalog grows past One-Piece. Feeds the market pages.
  const productLists = await Promise.all(
    games.map((g) =>
      fetchPrices({ game: g.slug, limit: 500, sort: "price_desc" }).catch(
        () => ({ items: [] }),
      ),
    ),
  );
  const allProducts = productLists.flatMap((r) => r.items);

  // Market pages — one URL per top SKU.
  const marketPages: MetadataRoute.Sitemap = allProducts.map((item) => ({
    url: `${baseUrl}/market/${item.sku}`,
    lastModified: new Date(),
    changeFrequency: "hourly" as const,
    priority: 0.6,
  }));

  return [
    ...staticPages,
    ...guidePages,
    ...gameLandingPages,
    ...setPages,
    ...marketPages,
  ];
}
