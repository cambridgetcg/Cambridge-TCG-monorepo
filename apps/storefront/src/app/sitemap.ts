import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";

// The sitemap is deliberately independent of the restricted wholesale
// catalog. A crawler invitation must never be derived from internal-only
// names, sets, images, prices, rankings, counts, or even membership lists.
export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = "https://cambridgetcg.com";

  // Static pages
  const staticPages: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: "daily", priority: 1.0 },
    { url: `${baseUrl}/market`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${baseUrl}/auctions`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
    { url: `${baseUrl}/trade-in`, lastModified: new Date(), changeFrequency: "daily", priority: 0.8 },
    { url: `${baseUrl}/rewards`, lastModified: new Date(), changeFrequency: "daily", priority: 0.7 },
    { url: `${baseUrl}/community`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
    { url: `${baseUrl}/methodology/community-directory`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/licenses/community-directory-public-display-v1`, lastModified: new Date("2026-07-11"), changeFrequency: "yearly", priority: 0.3 },
    { url: `${baseUrl}/gallery-next-door`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.7 },
    { url: `${baseUrl}/about`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/login`, lastModified: new Date(), changeFrequency: "monthly", priority: 0.5 },
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

  return [...staticPages, ...guidePages];
}
