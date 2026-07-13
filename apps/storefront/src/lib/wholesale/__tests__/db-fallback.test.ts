import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAggregatorCoverage,
  fetchAggregatorCoverageHistory,
  fetchPrices,
  fetchGamesDetailed,
  fetchSetsDetailed,
  type AggregatorCoverageResponse,
  type AggregatorCoverageHistoryResponse,
} from "../client";
import {
  composeAggregatorCoverage,
  composeAggregatorCoverageHistory,
  dbFetchAggregatorCoverage,
  dbFetchAggregatorCoverageHistory,
  dbFetchPrices,
  dbFetchGames,
  dbFetchSets,
  isValidCoverageDate,
  isValidCoverageHistoryWindow,
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
    dbFetchAggregatorCoverageHistory: vi.fn(),
  };
});

const mockFetch = vi.fn();
const mockDbPrices = vi.mocked(dbFetchPrices);
const mockDbGames = vi.mocked(dbFetchGames);
const mockDbSets = vi.mocked(dbFetchSets);
const mockDbCoverage = vi.mocked(dbFetchAggregatorCoverage);
const mockDbCoverageHistory = vi.mocked(dbFetchAggregatorCoverageHistory);

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
  mockDbCoverageHistory.mockReset();
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

const dbCoverageHistory: AggregatorCoverageHistoryResponse =
  composeAggregatorCoverageHistory(
    {
      start_date: "2026-07-07",
      through_date: "2026-07-13",
      total_observations: 8,
      distinct_cards: 3,
      distinct_games: 1,
      distinct_sources: 2,
      unassigned_observations: 1,
      observed_sources: ["tcgplayer", "cardrush"],
      by_day: [
        {
          date: "2026-07-07",
          observations: 5,
          distinct_cards: 2,
          distinct_games: 1,
          distinct_sources: 1,
          unassigned_observations: 0,
          sources: ["cardrush"],
          games: ["op"],
        },
        {
          date: "2026-07-09",
          observations: 3,
          distinct_cards: 2,
          distinct_games: 1,
          distinct_sources: 2,
          unassigned_observations: 1,
          sources: ["tcgplayer", "cardrush"],
          games: ["op"],
        },
      ],
    },
    "7d",
    { source: null, game: null },
    "2026-07-13T09:00:00.000Z",
  );

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

describe("fetchAggregatorCoverageHistory source fallback", () => {
  it("reads the database directly with the bounded window and filters", async () => {
    mockDbCoverageHistory.mockResolvedValueOnce({
      ...dbCoverageHistory,
      filter: {
        window: "7d",
        window_days: 7,
        source: "cardrush",
        game: "op",
      },
    });
    const filters = { window: "7d" as const, source: "cardrush", game: "op" };

    const result = await fetchAggregatorCoverageHistory(filters);

    expect(result?.filter).toEqual({ ...filters, window_days: 7 });
    expect(mockDbCoverageHistory).toHaveBeenCalledWith(filters);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns null rather than an empty history when the database fails", async () => {
    mockDbCoverageHistory.mockRejectedValueOnce(new Error("db down"));
    expect(await fetchAggregatorCoverageHistory({ window: "7d" })).toBeNull();
  });

  it("coalesces identical reads but keeps different windows in different cache keys", async () => {
    vi.stubEnv("COVERAGE_CACHE_DISABLED", "");
    mockDbCoverageHistory.mockResolvedValue(dbCoverageHistory);
    const lane = { source: "history-cache-test" };

    const [first, second] = await Promise.all([
      fetchAggregatorCoverageHistory({ ...lane, window: "7d" }),
      fetchAggregatorCoverageHistory({ ...lane, window: "7d" }),
    ]);
    await fetchAggregatorCoverageHistory({ ...lane, window: "30d" });

    expect(first).toBe(second);
    expect(mockDbCoverageHistory).toHaveBeenCalledTimes(2);
    expect(mockDbCoverageHistory).toHaveBeenNthCalledWith(1, {
      ...lane,
      window: "7d",
      game: undefined,
    });
    expect(mockDbCoverageHistory).toHaveBeenNthCalledWith(2, {
      ...lane,
      window: "30d",
      game: undefined,
    });
  });
});

describe("coverage read concurrency", () => {
  it("shares a max-three in-flight gate across current and history reads while coalescing identical keys", async () => {
    vi.stubEnv("COVERAGE_CACHE_DISABLED", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const currentA = deferred<AggregatorCoverageResponse>();
    const historyB = deferred<AggregatorCoverageHistoryResponse>();
    const currentC = deferred<AggregatorCoverageResponse>();

    mockDbCoverage.mockImplementation((opts) => {
      if (opts?.source === "gate-current-a") return currentA.promise;
      if (opts?.source === "gate-current-c") return currentC.promise;
      throw new Error(`unexpected current coverage source: ${opts?.source}`);
    });
    mockDbCoverageHistory.mockImplementation(({ source }) => {
      if (source === "gate-history-b") return historyB.promise;
      return Promise.resolve(dbCoverageHistory);
    });

    const first = fetchAggregatorCoverage({ source: "gate-current-a" });
    const firstAgain = fetchAggregatorCoverage({ source: "gate-current-a" });
    const second = fetchAggregatorCoverageHistory({
      window: "7d",
      source: "gate-history-b",
    });
    const third = fetchAggregatorCoverage({ source: "gate-current-c" });

    const rejected = await fetchAggregatorCoverageHistory({
      window: "30d",
      source: "gate-history-d",
    });

    expect(rejected).toBeNull();
    expect(mockDbCoverage).toHaveBeenCalledTimes(2);
    expect(mockDbCoverageHistory).toHaveBeenCalledTimes(1);

    currentA.resolve(dbCoverage);
    historyB.resolve(dbCoverageHistory);
    currentC.resolve(dbCoverage);

    const [firstResult, firstAgainResult, secondResult, thirdResult] =
      await Promise.all([first, firstAgain, second, third]);
    expect(firstResult).toBe(firstAgainResult);
    expect(firstResult).toBe(dbCoverage);
    expect(secondResult).toBe(dbCoverageHistory);
    expect(thirdResult).toBe(dbCoverage);
  });

  it("releases rejected slots and still serves settled cache hits at capacity", async () => {
    vi.stubEnv("COVERAGE_CACHE_DISABLED", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    mockDbCoverage.mockResolvedValueOnce(dbCoverage);
    const cached = await fetchAggregatorCoverage({ source: "gate-cached" });

    const failing = deferred<AggregatorCoverageResponse>();
    const history = deferred<AggregatorCoverageHistoryResponse>();
    const current = deferred<AggregatorCoverageResponse>();
    mockDbCoverage.mockImplementation((opts) => {
      if (opts?.source === "gate-failing") return failing.promise;
      if (opts?.source === "gate-current") return current.promise;
      throw new Error(`unexpected current coverage source: ${opts?.source}`);
    });
    mockDbCoverageHistory.mockImplementation(({ source }) => {
      if (source === "gate-history") return history.promise;
      if (source === "gate-recovered") return Promise.resolve(dbCoverageHistory);
      throw new Error(`unexpected history coverage source: ${source}`);
    });

    const first = fetchAggregatorCoverage({ source: "gate-failing" });
    const second = fetchAggregatorCoverageHistory({
      window: "7d",
      source: "gate-history",
    });
    const third = fetchAggregatorCoverage({ source: "gate-current" });

    expect(await fetchAggregatorCoverage({ source: "gate-cached" })).toBe(cached);
    expect(
      await fetchAggregatorCoverageHistory({
        window: "30d",
        source: "gate-before-release",
      }),
    ).toBeNull();

    failing.reject(new Error("bounded read failed"));
    expect(await first).toBeNull();
    expect(
      await fetchAggregatorCoverageHistory({
        window: "90d",
        source: "gate-recovered",
      }),
    ).toBe(dbCoverageHistory);

    history.resolve(dbCoverageHistory);
    current.resolve(dbCoverage);
    await expect(second).resolves.toBe(dbCoverageHistory);
    await expect(third).resolves.toBe(dbCoverage);
    expect(mockDbCoverage).toHaveBeenCalledTimes(3);
    expect(mockDbCoverageHistory).toHaveBeenCalledTimes(2);
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

  it("accepts only the three bounded coverage-history windows", () => {
    expect(isValidCoverageHistoryWindow("7d")).toBe(true);
    expect(isValidCoverageHistoryWindow("30d")).toBe(true);
    expect(isValidCoverageHistoryWindow("90d")).toBe(true);
    expect(isValidCoverageHistoryWindow("365d")).toBe(false);
    expect(isValidCoverageHistoryWindow("")).toBe(false);
  });

  it("zero-fills history dates and keeps whole-window distinct counts non-additive", () => {
    expect(dbCoverageHistory.by_day).toHaveLength(7);
    expect(dbCoverageHistory.by_day.map((day) => day.date)).toEqual([
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
      "2026-07-13",
    ]);
    expect(dbCoverageHistory.by_day[1]).toMatchObject({
      observations: 0,
      distinct_cards: 0,
      sources: [],
      games: [],
    });
    expect(dbCoverageHistory.by_day[2].sources).toEqual([
      "cardrush",
      "tcgplayer",
    ]);
    expect(dbCoverageHistory.by_day[6].is_current_utc_day).toBe(true);
    expect(dbCoverageHistory.summary).toMatchObject({
      total_observations: 8,
      distinct_cards: 3,
      completed_days: 6,
      observed_completed_days: 2,
      zero_observation_completed_days: 4,
      observation_completed_day_ratio: 0.3333,
      observed_days_including_current: 2,
    });
    expect(dbCoverageHistory.summary).not.toHaveProperty("zero_observation_days");
  });

  it("zero-fills exact 30d and 90d UTC windows across month, year, and leap-day rollovers", () => {
    const emptyRow = (startDate: string, throughDate: string) => ({
      start_date: startDate,
      through_date: throughDate,
      total_observations: 0,
      distinct_cards: 0,
      distinct_games: 0,
      distinct_sources: 0,
      unassigned_observations: 0,
      observed_sources: [],
      by_day: [],
    });

    const thirtyDays = composeAggregatorCoverageHistory(
      emptyRow("2026-01-03", "2026-02-01"),
      "30d",
      { source: null, game: null },
      "2026-02-01T12:00:00.000Z",
    );
    const ninetyDays = composeAggregatorCoverageHistory(
      emptyRow("2023-12-02", "2024-02-29"),
      "90d",
      { source: null, game: null },
      "2024-02-29T12:00:00.000Z",
    );

    expect(thirtyDays.by_day).toHaveLength(30);
    expect(thirtyDays.by_day[0].date).toBe("2026-01-03");
    expect(thirtyDays.by_day[28].date).toBe("2026-01-31");
    expect(thirtyDays.by_day[29]).toMatchObject({
      date: "2026-02-01",
      is_current_utc_day: true,
      observations: 0,
    });

    expect(ninetyDays.by_day).toHaveLength(90);
    expect(ninetyDays.by_day[0].date).toBe("2023-12-02");
    expect(ninetyDays.by_day[29].date).toBe("2023-12-31");
    expect(ninetyDays.by_day[30].date).toBe("2024-01-01");
    expect(ninetyDays.by_day[88].date).toBe("2024-02-28");
    expect(ninetyDays.by_day[89]).toMatchObject({
      date: "2024-02-29",
      is_current_utc_day: true,
      observations: 0,
    });
    expect(ninetyDays.summary).toMatchObject({
      completed_days: 89,
      observed_completed_days: 0,
      zero_observation_completed_days: 89,
      observation_completed_day_ratio: 0,
      observed_days_including_current: 0,
    });
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
