import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchAggregatorCoverageHistory,
  type AggregatorCoverageHistoryResponse,
} from "@/lib/wholesale/client";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({
  fetchAggregatorCoverageHistory: vi.fn(),
}));

const mockFetchHistory = vi.mocked(fetchAggregatorCoverageHistory);

function historyFixture(
  overrides: Partial<AggregatorCoverageHistoryResponse> = {},
): AggregatorCoverageHistoryResponse {
  return {
    period: {
      start: "2026-07-07",
      through: "2026-07-13",
      timezone: "UTC",
      current_utc_day_may_be_incomplete: true,
    },
    summary: {
      total_observations: 5,
      distinct_cards: 2,
      distinct_games: 1,
      distinct_sources: 1,
      unassigned_observations: 0,
      observed_days_including_current: 1,
      completed_days: 6,
      observed_completed_days: 1,
      zero_observation_completed_days: 5,
      observation_completed_day_ratio: 0.1667,
    },
    by_day: [
      {
        date: "2026-07-07",
        is_current_utc_day: false,
        observations: 5,
        distinct_cards: 2,
        distinct_games: 1,
        distinct_sources: 1,
        unassigned_observations: 0,
        sources: ["cardrush"],
        games: ["op"],
      },
      ...Array.from({ length: 6 }, (_, index) => ({
        date: `2026-07-${String(index + 8).padStart(2, "0")}`,
        is_current_utc_day: index === 5,
        observations: 0,
        distinct_cards: 0,
        distinct_games: 0,
        distinct_sources: 0,
        unassigned_observations: 0,
        sources: [] as string[],
        games: [] as string[],
      })),
    ],
    observed_sources: ["cardrush"],
    filter: {
      window: "7d",
      window_days: 7,
      source: null,
      game: null,
    },
    queried_at: "2026-07-13T09:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  mockFetchHistory.mockReset();
});

describe("GET /api/v1/coverage/history", () => {
  it("defaults an absent window to 30d and preserves bounded filters", async () => {
    mockFetchHistory.mockResolvedValueOnce(
      historyFixture({
        filter: {
          window: "30d",
          window_days: 30,
          source: "cardrush",
          game: "op",
        },
      }),
    );

    const response = await GET(
      new Request(
        "https://example.test/api/v1/coverage/history?source=cardrush&game=op",
      ),
    );

    expect(response.status).toBe(200);
    expect(mockFetchHistory).toHaveBeenCalledWith({
      window: "30d",
      source: "cardrush",
      game: "op",
    });
  });

  it("rejects invalid or explicitly empty windows before database work", async () => {
    for (const query of ["window=365d", "window="]) {
      const response = await GET(
        new Request(`https://example.test/api/v1/coverage/history?${query}`),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe("INVALID_INPUT");
    }
    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  it("rejects free-form source and game filters before database work", async () => {
    for (const query of [
      "source=",
      "game=",
      "source=cardrush%20OR%20TRUE",
      `game=${"x".repeat(65)}`,
    ]) {
      const response = await GET(
        new Request(`https://example.test/api/v1/coverage/history?${query}`),
      );
      expect(response.status).toBe(400);
    }
    expect(mockFetchHistory).not.toHaveBeenCalled();
  });

  it("keeps an unavailable database distinct from an empty window", async () => {
    mockFetchHistory.mockResolvedValueOnce(null);
    const unavailable = await GET(
      new Request("https://example.test/api/v1/coverage/history?window=7d"),
    );
    expect(unavailable.status).toBe(503);

    mockFetchHistory.mockResolvedValueOnce(
      historyFixture({
        summary: {
          total_observations: 0,
          distinct_cards: 0,
          distinct_games: 0,
          distinct_sources: 0,
          unassigned_observations: 0,
          observed_days_including_current: 0,
          completed_days: 6,
          observed_completed_days: 0,
          zero_observation_completed_days: 6,
          observation_completed_day_ratio: 0,
        },
        by_day: historyFixture().by_day.map((day) => ({
          ...day,
          observations: 0,
          distinct_cards: 0,
          distinct_games: 0,
          distinct_sources: 0,
          sources: [],
          games: [],
        })),
        observed_sources: [],
      }),
    );
    const empty = await GET(
      new Request("https://example.test/api/v1/coverage/history?window=7d"),
    );
    const body = await empty.json();

    expect(empty.status).toBe(200);
    expect(body.data.by_day).toHaveLength(7);
    expect(body.data.summary.total_observations).toBe(0);
    expect(body._meta.sources).toEqual([
      "cambridge-tcg.coverage-aggregation",
      "cambridge-tcg.catalog-game-mapping",
    ]);
  });

  it("carries contributing rights in parallel and fails unknown sources closed", async () => {
    mockFetchHistory.mockResolvedValueOnce(
      historyFixture({
        observed_sources: ["cardrush", "legacy-unregistered-source"],
      }),
    );

    const response = await GET(
      new Request("https://example.test/api/v1/coverage/history?window=7d"),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body._meta.sources).toEqual([
      "cambridge-tcg.coverage-aggregation",
      "cambridge-tcg.catalog-game-mapping",
      "cardrush",
      "legacy-unregistered-source",
    ]);
    expect(body._meta.source_license).toEqual([
      "cc0",
      "proprietary",
      "internal-only",
      "proprietary",
    ]);
    expect(body._meta.sources).toHaveLength(body._meta.source_license.length);
    expect(body._meta.license).toBe("NOASSERTION");
  });

  it("publishes only the reviewed daily operational fields", async () => {
    mockFetchHistory.mockResolvedValueOnce(historyFixture());

    const response = await GET(
      new Request("https://example.test/api/v1/coverage/history?window=7d"),
    );
    const body = await response.json();

    expect(Object.keys(body.data.by_day[0]).sort()).toEqual([
      "date",
      "distinct_cards",
      "distinct_games",
      "distinct_sources",
      "games",
      "is_current_utc_day",
      "observations",
      "sources",
      "unassigned_observations",
    ]);
    expect(body.data.by_day[6].is_current_utc_day).toBe(true);
    expect(body.data.measurement.snapshot_date).toContain("not a fetch timestamp");
    expect(body.data.measurement.daily_distinct_counts).toContain("must not be summed");
  });
});
