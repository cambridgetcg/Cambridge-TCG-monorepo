import { describe, expect, it, vi } from "vitest";
import { loadCatalogSitemap, CatalogSitemapUnavailableError, type CatalogSitemapReaders } from "./catalog-sitemap";
import type { PriceItem } from "./wholesale/client";

function fixture(): CatalogSitemapReaders {
  return {
    games: vi.fn(async () => ({ source: "wholesale-db" as const, games: [{ code: "op", name: "One Piece", slug: "one-piece", image_url: null, card_count: 600 }] })),
    sets: vi.fn(async () => ({ source: "wholesale-db" as const, sets: [{ code: "OP01", name: "Romance Dawn", game_code: "op", card_count: 600, release_date: "2022-07-22" }] })),
    prices: vi.fn(async () => ({ source: "wholesale-db" as const, count: 1, total: 600, channel: "cambridgetcg", items: [{ sku: "op-op01-001-ja", updated_at: "2026-09-01" } as PriceItem] })),
    artists: vi.fn(async () => [{ name: "A hand", slug: "a-hand", works: [], held: 0 }]),
  };
}

describe("catalog sitemap generation", () => {
  it("publishes the bounded game/set/product/market and named-hand pages without false dates", async () => {
    const source = fixture();
    const pages = await loadCatalogSitemap(source);
    expect(pages).toEqual([
      { url: "https://cambridgetcg.com/prices/one-piece" },
      { url: "https://cambridgetcg.com/prices/one-piece/op01" },
      { url: "https://cambridgetcg.com/product/op-op01-001-ja" },
      { url: "https://cambridgetcg.com/market/op-op01-001-ja" },
      { url: "https://cambridgetcg.com/artists/a-hand" },
    ]);
    expect(source.prices).toHaveBeenCalledWith({ game: "one-piece", limit: 500, sort: "number_asc" });
  });

  it("accepts genuinely empty sources and still checks the independent artist source", async () => {
    const source = fixture();
    vi.mocked(source.games).mockResolvedValue({ games: [], source: "wholesale-db" });
    vi.mocked(source.artists).mockResolvedValue([]);
    expect(await loadCatalogSitemap(source)).toEqual([]);
    expect(source.artists).toHaveBeenCalledOnce();
    expect(source.prices).not.toHaveBeenCalled();
  });

  it.each(["games", "sets", "prices"] as const)("throws instead of publishing a partial sitemap on unavailable %s", async (key) => {
    const source = fixture();
    if (key === "games") vi.mocked(source.games).mockResolvedValue({ games: [], source: "unavailable" });
    if (key === "sets") vi.mocked(source.sets).mockResolvedValue({ sets: [], source: "unavailable" });
    if (key === "prices") vi.mocked(source.prices).mockResolvedValue({ items: [], count: 0, total: 0, channel: "", source: "unavailable" });
    await expect(loadCatalogSitemap(source)).rejects.toBeInstanceOf(CatalogSitemapUnavailableError);
  });

  it.each(["games", "sets", "prices", "artists"] as const)("wraps a thrown %s failure with source and cause", async (key) => {
    const source = fixture();
    const cause = new Error("fixture source failure");
    vi.mocked(source[key]).mockRejectedValue(cause);
    await expect(loadCatalogSitemap(source)).rejects.toMatchObject({ name: "CatalogSitemapUnavailableError", cause });
  });

  it("does not accept an unstamped synthetic empty price response", async () => {
    const source = fixture();
    vi.mocked(source.prices).mockResolvedValue({ items: [], count: 0, total: 0, channel: "" });
    await expect(loadCatalogSitemap(source)).rejects.toMatchObject({ source: "products:one-piece" });
  });

  it("enforces the per-game bound even if a reader returns excess rows and deduplicates URLs", async () => {
    const source = fixture();
    vi.mocked(source.prices).mockResolvedValue({ source: "wholesale-db", count: 501, total: 501, channel: "", items: Array.from({ length: 501 }, (_, i) => ({ sku: `fixture-${i}` } as PriceItem)) });
    const pages = await loadCatalogSitemap(source);
    expect(pages.filter((page) => page.url.includes("/product/"))).toHaveLength(500);
    expect(pages.some((page) => page.url.includes("fixture-500"))).toBe(false);
    vi.mocked(source.artists).mockResolvedValue([{ name: "A", slug: "same", works: [], held: 0 }, { name: "B", slug: "same", works: [], held: 0 }]);
    const deduplicated = await loadCatalogSitemap(source);
    expect(new Set(deduplicated.map((page) => page.url)).size).toBe(deduplicated.length);
  });
});
