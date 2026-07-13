import { beforeEach, describe, expect, it, vi } from "vitest";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({
  fetchAggregatorCoverage: vi.fn(),
}));

const mockFetchCoverage = vi.mocked(fetchAggregatorCoverage);

beforeEach(() => {
  mockFetchCoverage.mockReset();
});

describe("GET /api/v1/coverage", () => {
  it("rejects an impossible calendar date before reading the database", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/coverage?since=2026-02-30"),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_INPUT");
    expect(body._meta.endpoint).toBe("/api/v1/coverage");
    expect(mockFetchCoverage).not.toHaveBeenCalled();
  });

  it("rejects unbounded or free-form source and game filters", async () => {
    const response = await GET(
      new Request("https://example.test/api/v1/coverage?source=cardrush%20OR%20TRUE"),
    );

    expect(response.status).toBe(400);
    expect((await response.json())._meta.endpoint).toBe("/api/v1/coverage");
    expect(mockFetchCoverage).not.toHaveBeenCalled();
  });

  it("rejects explicitly empty filters instead of broadening the read", async () => {
    for (const query of ["source=", "game=", "since="]) {
      const response = await GET(
        new Request(`https://example.test/api/v1/coverage?${query}`),
      );
      expect(response.status).toBe(400);
      expect((await response.json())._meta.endpoint).toBe("/api/v1/coverage");
    }
    expect(mockFetchCoverage).not.toHaveBeenCalled();
  });

  it("maps observed sources to their reviewed rights tier and defaults unknown ids closed", async () => {
    mockFetchCoverage.mockResolvedValueOnce({
      summary: {
        total_observations: 2,
        distinct_cards: 1,
        distinct_games: 1,
        distinct_sources: 2,
        unassigned_observations: 0,
        earliest_snapshot: "2026-07-10",
        latest_snapshot: "2026-07-11",
        days_of_coverage: 2,
      },
      by_game_source: [],
      by_game: [],
      by_source: [
        {
          source: "cardrush",
          games: ["op"],
          observations: 1,
          distinct_cards: 1,
          earliest_snapshot: "2026-07-10",
          latest_snapshot: "2026-07-11",
        },
        {
          source: "legacy-unregistered-source",
          games: ["op"],
          observations: 1,
          distinct_cards: 1,
          earliest_snapshot: "2026-07-10",
          latest_snapshot: "2026-07-11",
        },
      ],
      filter: { source: null, game: null, since: null },
      queried_at: "2026-07-11T12:00:00.000Z",
    });

    const response = await GET(new Request("https://example.test/api/v1/coverage"));
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
  });
});
