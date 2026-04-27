import type { MetadataRoute } from "next";
import { fetchPrices, fetchSets } from "@/lib/wholesale/client";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://cambridgetcg.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/catalog`, lastModified: new Date(), changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/market`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/auctions`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${baseUrl}/trade-in`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/rewards`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/community`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/prices`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/prices/one-piece`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
  ];

  // Set pages
  const sets = await fetchSets("one-piece").catch(() => []);
  const setPages: MetadataRoute.Sitemap = sets.map((set) => ({
    url: `${baseUrl}/prices/one-piece/${set.code.toLowerCase()}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.7,
  }));

  // Product pages (top 500 cards)
  const products = await fetchPrices({ game: "one-piece", limit: 500, sort: "price_desc" }).catch(() => ({ items: [] }));
  const productPages: MetadataRoute.Sitemap = products.items.map((item) => ({
    url: `${baseUrl}/product/${item.sku}`,
    lastModified: new Date(),
    changeFrequency: "daily" as const,
    priority: 0.6,
  }));

  // Market pages (same SKUs)
  const marketPages: MetadataRoute.Sitemap = products.items.map((item) => ({
    url: `${baseUrl}/market/${item.sku}`,
    lastModified: new Date(),
    changeFrequency: "hourly" as const,
    priority: 0.6,
  }));

  return [...staticPages, ...setPages, ...productPages, ...marketPages];
}
