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
    id: "cardmarket",
    name: "Cardmarket",
    description: "",
    upstream: "https://example.test",
    catalog_section: "x",
    access: "public-file",
    license: "proprietary",
    redistribute: false,
    freshness: "price_current",
    canonical_effort: "medium",
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
      "cardmarket",
    ]);
    expect(body._meta.source_license).toEqual(["cc0", "proprietary", "proprietary"]);
    expect(body._meta.does_not_include).toContain(
      "CC0 applies only to rights Cambridge holds in the board shape and explanatory metadata; the internal card-to-game mapping is proprietary, and upstream terms still govern upstream material",
    );
    expect(JSON.stringify(body.data.board)).not.toMatch(/price_gbp|price_amount|user_id|email/);
  });

  // The registry's own CardRush and TCGplayer metas: partial for their page
  // collectors, legacy locks closed. Their archive rows stay documentation
  // review and none of their declared games becomes an invitation.
  it("offers no acquisition-shaped candidate for a source whose legacy lock is closed", async () => {
    const actual = await vi.importActual<typeof import("@cambridge-tcg/data-ingest")>("@cambridge-tcg/data-ingest");
    mockSources.mockReturnValue(actual.listSourceMeta().filter((meta) => meta.id === "cardrush" || meta.id === "tcgplayer"));
    const base = await fetchAggregatorCoverage();
    mockCoverage.mockResolvedValue({
      ...base!,
      by_game_source: [{
        game_code: "op", game_slug: "one-piece", game_name: "One Piece", source: "cardrush",
        observations: 12, distinct_cards: 4, earliest_snapshot: "2026-06-01", latest_snapshot: "2026-07-11",
        days_of_coverage: 41, freshest_age_hours: 2600,
      }],
    });
    const body = await (await GET(new Request("https://example.test/api/v1/coverage/hunt?limit=24"))).json();
    expect(body.data.board.candidates.map((entry: { selection_trace: { rule: string } }) => entry.selection_trace.rule))
      .toEqual(["observed_pair_conflicts_with_current_source_gate"]);
    expect(body.data.board.candidates[0].selection_trace).toMatchObject({ registry_status: "partial", acquisition_task: false });
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
