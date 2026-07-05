import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchPrices, fetchGamesDetailed, fetchSetsDetailed } from "../client";
import { dbFetchPrices, dbFetchGames, dbFetchSets } from "../db-source";
import { stripSslMode, isLocalDbHost, channelPriceForRow } from "../db-source";
import type { ChannelConfig } from "@cambridge-tcg/pricing";

vi.mock("../db-source", async () => {
  const actual = await vi.importActual<typeof import("../db-source")>("../db-source");
  return {
    ...actual,
    dbFetchPrices: vi.fn(),
    dbFetchGames: vi.fn(),
    dbFetchSets: vi.fn(),
  };
});

const mockFetch = vi.fn();
const mockDbPrices = vi.mocked(dbFetchPrices);
const mockDbGames = vi.mocked(dbFetchGames);
const mockDbSets = vi.mocked(dbFetchSets);

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("WHOLESALE_API_URL", "https://example.test");
  vi.stubEnv("WHOLESALE_API_KEY", "test-key");
  vi.stubEnv("WHOLESALE_DB_DIRECT", "");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
  mockDbPrices.mockReset();
  mockDbGames.mockReset();
  mockDbSets.mockReset();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const httpPrices = { count: 1, total: 1, channel: "cambridgetcg", items: [{ sku: "OP-OP01-001-JP" }] };
const dbPrices = {
  count: 1,
  total: 1,
  channel: "cambridgetcg",
  items: [],
  source: "wholesale-db" as const,
};

describe("fetchPrices source fallback", () => {
  it("serves from the HTTP API when it answers, without touching the DB", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(httpPrices));
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("wholesale-api");
    expect(res.items).toHaveLength(1);
    expect(mockDbPrices).not.toHaveBeenCalled();
  });

  it("falls back to the DB source when HTTP throws", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));
    mockDbPrices.mockResolvedValueOnce(dbPrices);
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("wholesale-db");
    expect(mockDbPrices).toHaveBeenCalledOnce();
  });

  it("falls back to the DB source on a non-200 HTTP status", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ error: "nope" }, 502));
    mockDbPrices.mockResolvedValueOnce(dbPrices);
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("wholesale-db");
  });

  it("skips HTTP entirely when WHOLESALE_DB_DIRECT=1", async () => {
    vi.stubEnv("WHOLESALE_DB_DIRECT", "1");
    mockDbPrices.mockResolvedValueOnce(dbPrices);
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("wholesale-db");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("reports 'unavailable' — not a fabricated empty catalog — when both sources fail", async () => {
    mockFetch.mockRejectedValueOnce(new Error("connect ETIMEDOUT"));
    mockDbPrices.mockRejectedValueOnce(new Error("db down"));
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("unavailable");
    expect(res.items).toEqual([]);
  });
});

describe("fetchGamesDetailed / fetchSetsDetailed source fallback", () => {
  it("falls back to DB games on HTTP failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    mockDbGames.mockResolvedValueOnce([
      { code: "op", name: "One Piece Card Game", slug: "one-piece", image_url: null, card_count: 30 },
    ]);
    const res = await fetchGamesDetailed();
    expect(res.source).toBe("wholesale-db");
    expect(res.games[0].slug).toBe("one-piece");
  });

  it("reports 'unavailable' for sets when both sources fail", async () => {
    mockFetch.mockRejectedValueOnce(new Error("timeout"));
    mockDbSets.mockRejectedValueOnce(new Error("db down"));
    const res = await fetchSetsDetailed("one-piece");
    expect(res.source).toBe("unavailable");
    expect(res.sets).toEqual([]);
  });
});

describe("db-source pure helpers", () => {
  it("stripSslMode removes sslmode while keeping the rest of the URL", () => {
    expect(stripSslMode("postgres://u@h:5432/db?sslmode=require")).toBe("postgres://u@h:5432/db");
    expect(stripSslMode("postgres://u@h/db?a=1&sslmode=no-verify")).toBe("postgres://u@h/db?a=1");
  });

  it("isLocalDbHost keys SSL off the host, treating unparseable URLs as remote", () => {
    expect(isLocalDbHost("postgres://localhost:5432/ctcg_wholesale_dev")).toBe(true);
    expect(isLocalDbHost("postgres://127.0.0.1/db")).toBe(true);
    expect(isLocalDbHost("postgres://prod.rds.amazonaws.com:5432/db")).toBe(false);
    expect(isLocalDbHost("not a url")).toBe(false);
  });

  it("channelPriceForRow computes from the JPY observation when present", () => {
    const config: ChannelConfig = {
      channel: "tradein-credit",
      marginMultiplier: 0.77,
      flatFeeSingles: 0,
      flatFeeSealed: 0,
      vatMultiplier: 1.0,
      retailMultiplier: 1.0,
      roundTo: 0.01,
    };
    const price = channelPriceForRow(
      { cardrush_jpy: 1000, gbp_jpy_rate: 200, category: "singles", price_gbp: 99 },
      config,
    );
    // 1000/200 = £5 base × 0.77 = £3.85
    expect(price).toBe(3.85);
  });

  it("channelPriceForRow falls back to price_gbp when the card has no JPY observation", () => {
    const config: ChannelConfig = {
      channel: "cambridgetcg",
      marginMultiplier: 1.08,
      flatFeeSingles: 0.22,
      flatFeeSealed: 2.2,
      vatMultiplier: 1.2,
      retailMultiplier: 1.15,
      roundTo: 0.1,
    };
    expect(
      channelPriceForRow({ cardrush_jpy: null, gbp_jpy_rate: null, category: "singles", price_gbp: 4.2 }, config),
    ).toBe(4.2);
    expect(
      channelPriceForRow({ cardrush_jpy: null, gbp_jpy_rate: null, category: "singles", price_gbp: null }, config),
    ).toBeNull();
  });
});
