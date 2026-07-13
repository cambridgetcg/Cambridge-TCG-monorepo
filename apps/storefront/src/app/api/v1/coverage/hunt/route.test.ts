import { beforeEach, describe, expect, it, vi } from "vitest";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import { GET } from "./route";

vi.mock("@/lib/wholesale/client", () => ({ fetchAggregatorCoverage: vi.fn() }));
vi.mock("@cambridge-tcg/data-ingest", () => ({ listSourceMeta: vi.fn() }));

const mockCoverage = vi.mocked(fetchAggregatorCoverage);
const mockSources = vi.mocked(listSourceMeta);

beforeEach(() => {
  vi.resetAllMocks();
  mockSources.mockReturnValue([{
    id: "cardrush",
    name: "CardRush",
    description: "",
    upstream: "https://example.test",
    catalog_section: "x",
    access: "scrape",
    license: "internal-only",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "high",
    status: "partial",
    games: ["op"],
    tos_notes: "",
  }]);
  mockCoverage.mockResolvedValue({
    summary: {
      total_observations: 0,
      distinct_cards: 0,
      distinct_games: 0,
      distinct_sources: 0,
      unassigned_observations: 0,
      earliest_snapshot: null,
      latest_snapshot: "2026-07-11",
      days_of_coverage: 0,
    },
    by_game_source: [],
    by_game: [],
    by_source: [],
    filter: { source: null, game: null, since: null },
    queried_at: "2026-07-12T10:00:00.000Z",
  });
});

describe("GET /api/v1/coverage/hunt", () => {
  it("publishes bounded candidates and a no-apply contract", async () => {
    const response = await GET(new Request("https://example.test/api/v1/coverage/hunt?limit=3"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.board.returned_candidate_count).toBe(1);
    expect(body.data.game_contract).toMatchObject({
      three_distinct_agents_required: true,
      apply_transition_exists: false,
      human_review_required: true,
    });
    expect(body._meta.license).toBe("NOASSERTION");
    expect(body._meta.sources).toEqual([
      "cambridge-tcg.coverage-hunt-board",
      "cambridge-tcg.catalog-game-mapping",
      "cardrush",
    ]);
    expect(body._meta.source_license).toEqual(["cc0", "proprietary", "internal-only"]);
    expect(body._meta.does_not_include).toContain(
      "CC0 applies only to rights Cambridge holds in the board shape and explanatory metadata; the internal card-to-game mapping is proprietary, and upstream terms still govern upstream material",
    );
    expect(JSON.stringify(body.data.board)).not.toMatch(/price_gbp|price_amount|user_id|email/);
  });

  it("returns 503 rather than an invented board when coverage is unavailable", async () => {
    mockCoverage.mockResolvedValue(null);
    const response = await GET(new Request("https://example.test/api/v1/coverage/hunt"));
    expect(response.status).toBe(503);
  });

  it("bounds limits before reading coverage", async () => {
    const response = await GET(new Request("https://example.test/api/v1/coverage/hunt?limit=999"));
    expect(response.status).toBe(400);
    expect(mockCoverage).not.toHaveBeenCalled();
  });
});
