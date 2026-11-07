import { describe, expect, it } from "vitest";
import { getSource, type SourceMeta } from "@cambridge-tcg/data-ingest";
import type { AggregatorCoverageResponse } from "@/lib/wholesale/client";
import { buildCoverageHuntBoard, type CoverageHuntBoard } from "./board";

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

// A partial source with no legacy lock. CardRush and TCGplayer are partial
// too, but their locks decide their board (below).
const partialSource = {
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
} as SourceMeta;

/** The two metas as they stood at 53b2c906, before the 2026-10-28 page
 * collectors: what the board read then. Only the fields it reads. */
const PRE_CHANGE_METAS = [
  {
    ...partialSource,
    id: "cardrush",
    access: "scrape",
    license: "internal-only",
    freshness: "price_current",
    status: "blocked",
    games: ["op", "pkm", "dbs", "dbf", "mtg", "ygo", "dmw", "vng", "wei", "fab", "lgr", "bsr"],
  },
  {
    ...partialSource,
    id: "tcgplayer",
    access: "blocked",
    license: "proprietary",
    freshness: "price_current",
    status: "blocked",
    games: ["mtg", "pkm", "ygo", "op", "dbs", "dbf", "lgr", "fab", "dmw", "vng", "wei", "bsr"],
  },
] as SourceMeta[];

/** A legacy archive holding CardRush and TCGplayer rows: a declared game
 * (op, pkm), one CardRush no longer declares (dbs), and declared games with
 * no row (vng and the rest), which a partial source would be invited for. */
function archiveRow(source: string, game: [string, string, string], observations: number, freshest: number) {
  return {
    game_code: game[0], game_slug: game[1], game_name: game[2], source,
    observations, distinct_cards: Math.ceil(observations / 3),
    earliest_snapshot: "2026-05-01", latest_snapshot: "2026-07-11",
    days_of_coverage: 70, freshest_age_hours: freshest,
  };
}
const ARCHIVE = coverage({
  summary: { ...coverage().summary, total_observations: 269_040, unassigned_observations: 12 },
  by_game_source: [
    archiveRow("cardrush", ["op", "one-piece", "One Piece"], 180_000, 2610.5),
    archiveRow("cardrush", ["pkm", "pokemon", "Pokémon"], 80_000, 2611),
    archiveRow("cardrush", ["dbs", "dragon-ball-super", "Dragon Ball Super"], 9_000, 4000),
    archiveRow("tcgplayer", ["op", "one-piece", "One Piece"], 28, 3100),
  ],
  queried_at: "2026-10-28T12:00:00.000Z",
});

/** The pre-change board with each trace's registry fields read from the
 * given metas: those fields report the registry as it is, not as it was. */
function withRegistry(board: CoverageHuntBoard, metas: readonly SourceMeta[]): CoverageHuntBoard {
  const byId = new Map(metas.map((meta) => [meta.id as string, meta]));
  return {
    ...board,
    candidates: board.candidates.map((entry) => {
      const meta = entry.candidate.target.source_id ? byId.get(entry.candidate.target.source_id) : undefined;
      return meta
        ? { ...entry, selection_trace: { ...entry.selection_trace, registry_status: meta.status, registry_access: meta.access } }
        : entry;
    }),
  };
}

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
      target: { game_code: "op", source_id: "cardmarket" },
      metrics: { observations: 0 },
    });
    expect(first.candidates[0]?.selection_trace).toEqual({
      rule: "declared_pair_absent_from_observation_archive",
      registry_status: "partial",
      registry_access: "public-file",
      observed_pair_present: false,
      acquisition_task: false,
    });
    expect(JSON.stringify(first)).not.toMatch(
      /price_(?:amount|gbp)|user_id|email|evidence_sha256/i,
    );
  });

  it("turns blocked observed state into documentation review, never collection", () => {
    const blocked = { ...partialSource, id: "ygoprodeck", access: "public-api", status: "blocked" } as SourceMeta;
    const board = buildCoverageHuntBoard(
      coverage({
        by_game_source: [{
          game_code: "op",
          game_slug: "one-piece",
          game_name: "One Piece",
          source: "ygoprodeck",
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

  // CardRush and TCGplayer turned partial on 2026-10-28 for page collectors
  // that write elsewhere; their legacy locks stay closed. The board reads the
  // locks, so deploying the change leaves it as it was: archive rows stay
  // documentation review, never acquisition tasks, and no declared game
  // becomes an invitation. Each candidate keeps its id.
  it("gives a CardRush and TCGplayer archive the board it had before their collectors", () => {
    const current = (["cardrush", "tcgplayer"] as const).map((id) => getSource(id)!.meta);
    expect(current.map((meta) => meta.status)).toEqual(["partial", "partial"]);
    expect(current.map((meta) => meta.freshness)).toEqual(["page_collector", "page_collector"]);

    const before = buildCoverageHuntBoard(ARCHIVE, PRE_CHANGE_METAS, { limit: 24 });
    const after = buildCoverageHuntBoard(ARCHIVE, current, { limit: 24 });
    expect(after).toEqual(withRegistry(before, current));
    for (const game of ["op", "dbs", "vng"]) {
      expect(buildCoverageHuntBoard(ARCHIVE, current, { game, limit: 24 }))
        .toEqual(withRegistry(buildCoverageHuntBoard(ARCHIVE, PRE_CHANGE_METAS, { game, limit: 24 }), current));
    }

    expect(after.candidates.map(({ candidate }) => `${candidate.target.source_id}:${candidate.target.game_code}`))
      .toEqual(["cardrush:dbs", "cardrush:op", "tcgplayer:op", "cardrush:pkm", "undefined:undefined"]);
    for (const entry of after.candidates.slice(0, 4)) {
      expect(entry.selection_trace).toMatchObject({ rule: "observed_pair_conflicts_with_current_source_gate", acquisition_task: false });
      // The legacy rows' own budget (five minutes), not the page collector's.
      expect(entry.candidate.metrics.freshness_budget_hours).toBe(300 / 3600);
    }
    expect(after.candidates.some(({ selection_trace }) => selection_trace.rule === "declared_pair_absent_from_observation_archive")).toBe(false);
  });

  // Cardmarket's meta moved from price_current to its daily collector's
  // daily_file (26 h) on 2026-10-28. Archive rows are not that collector's
  // batches, so a Cardmarket row three hours old is still past its budget,
  // as it was before.
  it("gives a Cardmarket archive the board it had before its daily collector", () => {
    const current = getSource("cardmarket")!.meta;
    expect(current).toMatchObject({ status: "partial", freshness: "daily_file" });
    const archive = coverage({
      by_game_source: [archiveRow("cardmarket", ["op", "one-piece", "One Piece"], 1_200, 3)],
      queried_at: "2026-10-28T12:00:00.000Z",
    });

    const before = buildCoverageHuntBoard(archive, [{ ...current, freshness: "price_current" }], { limit: 24 });
    const after = buildCoverageHuntBoard(archive, [current], { limit: 24 });
    expect(after).toEqual(before);
    const row = after.candidates.find(({ candidate }) => candidate.target.source_id === "cardmarket" && candidate.target.game_code === "op");
    expect(row?.selection_trace.rule).toBe("observed_pair_exceeds_declared_freshness_budget");
    expect(row?.candidate.metrics.freshness_budget_hours).toBe(300 / 3600);
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
