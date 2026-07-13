import { describe, expect, it } from "vitest";
import type { SourceMeta } from "@cambridge-tcg/data-ingest";
import type { AggregatorCoverageResponse } from "@/lib/wholesale/client";
import { buildCoverageHuntBoard } from "./board";

function coverage(
  patch: Partial<AggregatorCoverageResponse> = {},
): AggregatorCoverageResponse {
  return {
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
    ...patch,
  };
}

const partialSource = {
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
} as SourceMeta;

describe("Coverage Hunt board", () => {
  it("creates stable declared-vs-observed candidates without price fields", () => {
    const first = buildCoverageHuntBoard(coverage(), [partialSource]);
    const second = buildCoverageHuntBoard(
      coverage({ queried_at: "2026-07-12T11:00:00.000Z" }),
      [partialSource],
    );
    expect(first.candidates[0]?.candidate.id).toBe(second.candidates[0]?.candidate.id);
    expect(first.candidates[0]?.candidate).toMatchObject({
      kind: "declared_observed_disagreement",
      target: { game_code: "op", source_id: "cardrush" },
      metrics: { observations: 0 },
    });
    expect(first.candidates[0]?.selection_trace).toEqual({
      rule: "declared_pair_absent_from_observation_archive",
      registry_status: "partial",
      registry_access: "scrape",
      observed_pair_present: false,
      acquisition_task: false,
    });
    expect(JSON.stringify(first)).not.toMatch(
      /price_(?:amount|gbp)|user_id|email|evidence_sha256/i,
    );
  });

  it("turns blocked observed state into documentation review, never collection", () => {
    const blocked = { ...partialSource, id: "tcgplayer", access: "blocked", status: "blocked" } as SourceMeta;
    const board = buildCoverageHuntBoard(
      coverage({
        by_game_source: [{
          game_code: "op",
          game_slug: "one-piece",
          game_name: "One Piece",
          source: "tcgplayer",
          observations: 3,
          distinct_cards: 2,
          earliest_snapshot: "2026-07-01",
          latest_snapshot: "2026-07-11",
          days_of_coverage: 2,
          freshest_age_hours: 24,
        }],
      }),
      [blocked],
    );
    expect(board.candidates).toHaveLength(1);
    expect(board.candidates[0]?.candidate.why_candidate).toContain("does not permit new collection");
    expect(board.candidates[0]?.boundary).toContain("Do not bypass");
  });

  it("names unassigned rows without exposing their content", () => {
    const board = buildCoverageHuntBoard(
      coverage({ summary: { ...coverage().summary, unassigned_observations: 7 } }),
      [],
    );
    expect(board.candidates[0]?.candidate).toMatchObject({
      kind: "unassigned_observations",
      metrics: { unassigned_observations: 7 },
    });
  });

  it("caps the public board at 24 candidates", () => {
    const many = Array.from({ length: 40 }, (_, index) => ({
      ...partialSource,
      id: `source-${index}`,
    })) as unknown as SourceMeta[];
    const board = buildCoverageHuntBoard(coverage(), many, { limit: 999 });
    expect(board.returned_candidate_count).toBe(24);
    expect(board.available_candidate_count).toBe(40);
  });

  it("keeps an honestly empty board empty", () => {
    const board = buildCoverageHuntBoard(coverage(), []);
    expect(board).toMatchObject({
      candidates: [],
      available_candidate_count: 0,
      returned_candidate_count: 0,
      walking_past_is_honored: true,
    });
  });
});
