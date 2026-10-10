import { describe, expect, it, vi } from "vitest";

const sources = vi.hoisted(() => ({
  games: vi.fn(async () => ({ games: [], source: "wholesale-db" })),
  sets: vi.fn(), prices: vi.fn(), artists: vi.fn(async () => []),
  connection: vi.fn(async () => {}),
}));
vi.mock("@/lib/wholesale/client", () => ({
  fetchGamesDetailed: sources.games, fetchSetsDetailed: sources.sets, fetchPrices: sources.prices,
}));
vi.mock("@/lib/cards/artists", () => ({ getNamedHands: sources.artists }));
vi.mock("next/server", () => ({ connection: sources.connection }));
vi.mock("next/cache", () => ({ unstable_cache: vi.fn((fn) => fn) }));
import { unstable_cache } from "next/cache";
import sitemap from "./sitemap";

describe("catalog metadata route wiring", () => {
  it("uses hourly Data Cache around detailed readers and named hands, with no eager source read", async () => {
    expect(unstable_cache).toHaveBeenCalledWith(expect.any(Function), ["catalog-sitemap-v1"], { revalidate: 3600 });
    expect(sources.games).not.toHaveBeenCalled();
    expect(sources.artists).not.toHaveBeenCalled();
    expect(await sitemap()).toEqual([]);
    expect(sources.connection).toHaveBeenCalledOnce();
    expect(sources.games).toHaveBeenCalledOnce();
    expect(sources.artists).toHaveBeenCalledOnce();
  });

  it("waits for a connection outside the cache before source access", async () => {
    sources.games.mockClear();
    sources.artists.mockClear();
    let connect!: () => void;
    sources.connection.mockReturnValueOnce(new Promise<void>((resolve) => { connect = resolve; }));
    const pending = sitemap();
    await Promise.resolve();
    expect(sources.games).not.toHaveBeenCalled();
    expect(sources.artists).not.toHaveBeenCalled();
    connect();
    expect(await pending).toEqual([]);
    expect(sources.games).toHaveBeenCalledOnce();
  });

  it("lets cold typed generation errors escape rather than emitting success", async () => {
    sources.games.mockResolvedValueOnce({ source: "unavailable", games: [] });
    await expect(sitemap()).rejects.toMatchObject({ name: "CatalogSitemapUnavailableError", source: "games" });
  });
});
