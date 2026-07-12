import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAggregatorCoverage,
  fetchPrices,
  fetchGamesDetailed,
  fetchSetsDetailed,
  type AggregatorCoverageResponse,
} from "../client";
import {
  composeAggregatorCoverage,
  dbFetchAggregatorCoverage,
  dbFetchPrices,
  dbFetchGames,
  dbFetchSets,
  isValidCoverageDate,
  isValidCoverageToken,
} from "../db-source";
import { stripSslMode, isLocalDbHost, channelPriceForRow } from "../db-source";
import type { ChannelConfig } from "@cambridge-tcg/pricing";

vi.mock("../db-source", async () => {
  const actual = await vi.importActual<typeof import("../db-source")>("../db-source");
  return {
    ...actual,
    dbFetchPrices: vi.fn(),
    dbFetchGames: vi.fn(),
    dbFetchSets: vi.fn(),
    dbFetchAggregatorCoverage: vi.fn(),
  };
});

const mockFetch = vi.fn();
const mockDbPrices = vi.mocked(dbFetchPrices);
const mockDbGames = vi.mocked(dbFetchGames);
const mockDbSets = vi.mocked(dbFetchSets);
const mockDbCoverage = vi.mocked(dbFetchAggregatorCoverage);

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("WHOLESALE_API_URL", "https://example.test");
  vi.stubEnv("WHOLESALE_API_KEY", "test-key");
  vi.stubEnv("WHOLESALE_DB_DIRECT", "");
  vi.stubEnv("COVERAGE_CACHE_DISABLED", "1");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  mockFetch.mockReset();
  mockDbPrices.mockReset();
  mockDbGames.mockReset();
  mockDbSets.mockReset();
  mockDbCoverage.mockReset();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const httpPrices = {
  count: 1,
  total: 1,
  channel: "cambridgetcg",
  items: [{
    sku: "OP-OP01-001-JP",
    card_number: "OP01-001",
    price_gbp: 1234.56,
    channel_price: 2345.67,
    stock: 1,
    pending_stock: 0,
    image_url: "https://www.cardrush-op.jp/legacy-image.jpg",
    name: "sentinel",
    name_en: "sentinel",
    set_code: "OP01",
    set_name: "sentinel",
    rarity: "sentinel",
    category: "singles",
    updated_at: "2026-07-01T00:00:00.000Z",
  }],
};
const dbPrices = {
  count: 1,
  total: 1,
  channel: "cambridgetcg",
  items: [],
  source: "wholesale-db" as const,
};

const dbCoverage: AggregatorCoverageResponse = {
  summary: {
    total_observations: 12,
    distinct_cards: 4,
    distinct_games: 1,
    distinct_sources: 1,
    unassigned_observations: 0,
    earliest_snapshot: "2026-07-01",
    latest_snapshot: "2026-07-03",
    days_of_coverage: 3,
  },
  by_game_source: [
    {
      game_code: "op",
      game_slug: "one-piece",
      game_name: "One Piece Card Game",
      source: "cardrush",
      observations: 12,
      distinct_cards: 4,
      earliest_snapshot: "2026-07-01",
      latest_snapshot: "2026-07-03",
      days_of_coverage: 3,
      freshest_age_hours: 1,
    },
  ],
  by_game: [
    {
      game_code: "op",
      game_slug: "one-piece",
      game_name: "One Piece Card Game",
      sources: ["cardrush"],
      observations: 12,
      distinct_cards: 4,
      distinct_cards_max: 4,
      earliest_snapshot: "2026-07-01",
      latest_snapshot: "2026-07-03",
    },
  ],
  by_source: [
    {
      source: "cardrush",
      games: ["op"],
      observations: 12,
      distinct_cards: 4,
      earliest_snapshot: "2026-07-01",
      latest_snapshot: "2026-07-03",
    },
  ],
  filter: { source: null, game: null, since: null },
  queried_at: "2026-07-11T18:00:00.000Z",
};

describe("fetchPrices source fallback", () => {
  it("serves from the HTTP API when it answers, without touching the DB", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(httpPrices));
    const res = await fetchPrices({ game: "one-piece" });
    expect(res.source).toBe("wholesale-api");
    expect(res.items).toHaveLength(1);
    expect(res.items[0].price_gbp).toBeNull();
    expect(res.items[0].channel_price).toBeNull();
    expect(res.items[0].image_url).toBeNull();
    expect(JSON.stringify(res)).not.toContain("1234.56");
    expect(JSON.stringify(res)).not.toContain("cardrush-op.jp");
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

describe("fetchAggregatorCoverage source fallback", () => {
  it("reads the database directly and preserves filters", async () => {
    mockDbCoverage.mockResolvedValueOnce({
      ...dbCoverage,
      filter: { source: "cardrush", game: "op", since: "2026-07-01" },
    });
    const filters = { source: "cardrush", game: "op", since: "2026-07-01" };
    const res = await fetchAggregatorCoverage(filters);
    expect(res?.filter).toEqual(filters);
    expect(mockDbCoverage).toHaveBeenCalledWith(filters);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null instead of fabricating an empty archive when the database fails", async () => {
    mockDbCoverage.mockRejectedValueOnce(new Error("db down"));
    expect(await fetchAggregatorCoverage()).toBeNull();
  });

  it("coalesces identical reads within the cache window unless disabled", async () => {
    vi.stubEnv("COVERAGE_CACHE_DISABLED", "");
    mockDbCoverage.mockResolvedValueOnce(dbCoverage);
    const filters = { source: "cache-test" };
    const [first, second] = await Promise.all([
      fetchAggregatorCoverage(filters),
      fetchAggregatorCoverage(filters),
    ]);
    expect(first).toBe(second);
    expect(mockDbCoverage).toHaveBeenCalledOnce();
  });
});

describe("db-source pure helpers", () => {
  it("accepts real ISO dates and rejects impossible calendar dates", () => {
    expect(isValidCoverageDate("2024-02-29")).toBe(true);
    expect(isValidCoverageDate("2026-02-29")).toBe(false);
    expect(isValidCoverageDate("2026-02-30")).toBe(false);
    expect(isValidCoverageDate("2026-13-01")).toBe(false);
    expect(isValidCoverageDate("26-07-11")).toBe(false);
  });

  it("bounds coverage source and game identifiers", () => {
    expect(isValidCoverageToken("pokemon-tcg-api")).toBe(true);
    expect(isValidCoverageToken("one-piece")).toBe(true);
    expect(isValidCoverageToken("")).toBe(false);
    expect(isValidCoverageToken("op OR TRUE")).toBe(false);
    expect(isValidCoverageToken("x".repeat(65))).toBe(false);
  });

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

  it("composeAggregatorCoverage derives stable game and source rollups", () => {
    const pairs = [
      { ...dbCoverage.by_game_source[0], game_distinct_cards: 5 },
      {
        game_code: "op",
        game_slug: "one-piece",
        game_name: "One Piece Card Game",
        source: "tcgplayer",
        observations: 7,
        distinct_cards: 3,
        earliest_snapshot: "2026-07-02",
        latest_snapshot: "2026-07-04",
        days_of_coverage: 3,
        freshest_age_hours: 0,
        game_distinct_cards: 5,
      },
      {
        game_code: "pkm",
        game_slug: "pokemon",
        game_name: "Pokemon TCG",
        source: "cardrush",
        observations: 5,
        distinct_cards: 2,
        earliest_snapshot: "2026-06-30",
        latest_snapshot: "2026-07-02",
        days_of_coverage: 3,
        freshest_age_hours: 24,
        game_distinct_cards: 2,
      },
    ];
    const sources = [
      {
        source: "cardrush",
        games: ["pkm", "op"],
        observations: 19,
        distinct_cards: 7,
        earliest_snapshot: "2026-06-30",
        latest_snapshot: "2026-07-03",
      },
      {
        source: "tcgplayer",
        games: ["op"],
        observations: 7,
        distinct_cards: 3,
        earliest_snapshot: "2026-07-02",
        latest_snapshot: "2026-07-04",
      },
    ];
    const composed = composeAggregatorCoverage(
      {
        total_observations: 26,
        distinct_cards: 9,
        distinct_games: 2,
        distinct_sources: 2,
        unassigned_observations: 2,
        earliest_snapshot: "2026-06-30",
        latest_snapshot: "2026-07-04",
        days_of_coverage: 5,
      },
      pairs,
      sources,
      { source: null, game: null, since: null },
      "2026-07-11T18:00:00.000Z",
    );

    expect(composed.by_game).toEqual([
      {
        game_code: "op",
        game_slug: "one-piece",
        game_name: "One Piece Card Game",
        sources: ["cardrush", "tcgplayer"],
        observations: 19,
        distinct_cards: 5,
        distinct_cards_max: 4,
        earliest_snapshot: "2026-07-01",
        latest_snapshot: "2026-07-04",
      },
      {
        game_code: "pkm",
        game_slug: "pokemon",
        game_name: "Pokemon TCG",
        sources: ["cardrush"],
        observations: 5,
        distinct_cards: 2,
        distinct_cards_max: 2,
        earliest_snapshot: "2026-06-30",
        latest_snapshot: "2026-07-02",
      },
    ]);
    expect(composed.by_source.find((row) => row.source === "cardrush")).toMatchObject({
      games: ["op", "pkm"],
      observations: 19,
      distinct_cards: 7,
      earliest_snapshot: "2026-06-30",
      latest_snapshot: "2026-07-03",
    });
    expect(composed.summary.unassigned_observations).toBe(2);
  });

  it("composeAggregatorCoverage preserves an honestly empty archive", () => {
    const composed = composeAggregatorCoverage(
      {
        total_observations: 0,
        distinct_cards: 0,
        distinct_games: 0,
        distinct_sources: 0,
        unassigned_observations: 0,
        earliest_snapshot: null,
        latest_snapshot: null,
        days_of_coverage: 0,
      },
      [],
      [],
      { source: null, game: null, since: null },
      "2026-07-11T18:00:00.000Z",
    );

    expect(composed.summary.total_observations).toBe(0);
    expect(composed.by_game_source).toEqual([]);
    expect(composed.by_game).toEqual([]);
    expect(composed.by_source).toEqual([]);
  });
});
