import { FRESHNESS } from "@cambridge-tcg/data-spec";
import type { SourceMeta } from "@cambridge-tcg/data-ingest";
import type { AggregatorCoverageResponse } from "@/lib/wholesale/client";
import { createCoverageCandidate } from "./candidates";
import type {
  CoverageCandidateKind,
  CoverageCandidateSnapshot,
} from "./types";

export const COVERAGE_HUNT_BOARD_LIMIT = 24;

export interface CoverageHuntBoardEntry {
  candidate: CoverageCandidateSnapshot;
  selection_trace: {
    rule: string;
    registry_status: SourceMeta["status"] | null;
    registry_access: SourceMeta["access"] | null;
    observed_pair_present: boolean | null;
    acquisition_task: false;
  };
  eligible_evidence: readonly [
    "cambridge-resource",
    "publisher-page",
    "source-policy",
    "other-public",
  ];
  boundary: string;
}

export interface CoverageHuntBoard {
  candidates: CoverageHuntBoardEntry[];
  available_candidate_count: number;
  returned_candidate_count: number;
  as_of: string;
  walking_past_is_honored: true;
}

function stableMoment(value: string | null | undefined, fallback: string): string {
  const source = value ?? fallback;
  const parsed = new Date(source.length === 10 ? `${source}T00:00:00.000Z` : source);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return `${fallback.slice(0, 10)}T00:00:00.000Z`;
}

function canInviteEvidence(source: SourceMeta): boolean {
  return (
    (source.status === "shipped" || source.status === "partial") &&
    source.access !== "blocked"
  );
}

function entry(
  candidate: CoverageCandidateSnapshot,
  trace: Omit<CoverageHuntBoardEntry["selection_trace"], "acquisition_task">,
): CoverageHuntBoardEntry {
  return {
    candidate,
    selection_trace: { ...trace, acquisition_task: false },
    eligible_evidence: [
      "cambridge-resource",
      "publisher-page",
      "source-policy",
      "other-public",
    ],
    boundary:
      "Citation and metadata review only. Do not bypass authentication, robots, terms, rate limits, or source permissions; do not submit prices, personal data, raw upstream content, or collector observations.",
  };
}

/**
 * Turn the existing declared-vs-observed coverage matrix into a small,
 * deterministic invitation board. It deliberately stays at game × source
 * resolution until a real set-denominator read exists; it never invents a
 * set-level coverage percentage.
 */
export function buildCoverageHuntBoard(
  coverage: AggregatorCoverageResponse,
  sources: readonly SourceMeta[],
  options: { game?: string; kind?: CoverageCandidateKind; limit?: number } = {},
): CoverageHuntBoard {
  const candidates: CoverageHuntBoardEntry[] = [];
  const observedByPair = new Map(
    coverage.by_game_source.map((row) => [`${row.game_code}:${row.source}`, row] as const),
  );
  const sourceById = new Map(sources.map((source) => [source.id as string, source] as const));
  const fallbackMoment = stableMoment(
    coverage.summary.latest_snapshot,
    coverage.queried_at,
  );

  for (const source of sources) {
    if (!canInviteEvidence(source)) continue;
    for (const game of source.games) {
      if (options.game && options.game !== game) continue;
      if (observedByPair.has(`${game}:${source.id}`)) continue;
      candidates.push(
        entry(
          createCoverageCandidate({
            kind: "declared_observed_disagreement",
            target: { game_code: game, source_id: source.id },
            metrics: { observations: 0 },
            observed_at: fallbackMoment,
            why_candidate:
              "The source registry declares this game, but the observation archive contains no row for the pair. Determine from public documentation whether the declaration is active, blocked at a finer level, or simply uncovered. This is documentation review; do not collect or probe upstream.",
          }),
          {
            rule: "declared_pair_absent_from_observation_archive",
            registry_status: source.status,
            registry_access: source.access,
            observed_pair_present: false,
          },
        ),
      );
    }
  }

  for (const row of coverage.by_game_source) {
    if (options.game && options.game !== row.game_code) continue;
    const source = sourceById.get(row.source);
    const declaredForGame = source
      ? (source.games as readonly string[]).includes(row.game_code)
      : false;
    const budgetHours = source
      ? FRESHNESS[source.freshness] / 3600
      : undefined;
    const restricted = source?.status === "blocked" || source?.status === "planned" || source?.access === "blocked";
    const stale = budgetHours !== undefined && row.freshest_age_hours > budgetHours;
    if (source && declaredForGame && !restricted && !stale) continue;

    const reason = restricted
      ? "The archive contains observations for a source whose present registry state does not permit new collection. Review documentation or retention metadata only; this is never an acquisition task."
      : !source || !declaredForGame
        ? "The archive contains observations for a game/source pair the current registry does not declare. Check identifiers and documentation without copying upstream values."
        : "The newest archived observation is older than the source's declared freshness budget. Confirm the freshness claim or document the permitted coverage gap; do not bypass source rules.";
    candidates.push(
      entry(
        createCoverageCandidate({
          kind: "declared_observed_disagreement",
          target: { game_code: row.game_code, source_id: row.source },
          metrics: {
            observations: row.observations,
            freshest_age_hours: row.freshest_age_hours,
            ...(budgetHours === undefined ? {} : { freshness_budget_hours: budgetHours }),
          },
          observed_at: stableMoment(row.latest_snapshot, coverage.queried_at),
          why_candidate: reason,
        }),
        {
          rule: restricted
            ? "observed_pair_conflicts_with_current_source_gate"
            : !source || !declaredForGame
              ? "observed_pair_absent_from_registry_declaration"
              : "observed_pair_exceeds_declared_freshness_budget",
          registry_status: source?.status ?? null,
          registry_access: source?.access ?? null,
          observed_pair_present: true,
        },
      ),
    );
  }

  if (
    coverage.summary.unassigned_observations > 0 &&
    (!options.game || options.game === "unassigned")
  ) {
    candidates.push(
      entry(
        createCoverageCandidate({
          kind: "unassigned_observations",
          target: {},
          metrics: {
            unassigned_observations: coverage.summary.unassigned_observations,
          },
          observed_at: fallbackMoment,
          why_candidate:
            "Some archive rows have no game assignment. Investigate their internal identifiers and public documentation; never include price values or personal records.",
        }),
        {
          rule: "unassigned_observation_count_positive",
          registry_status: null,
          registry_access: null,
          observed_pair_present: null,
        },
      ),
    );
  }

  const filtered = candidates
    .filter(({ candidate }) => !options.kind || candidate.kind === options.kind)
    .sort((a, b) =>
      [a.candidate.kind, a.candidate.target.game_code ?? "", a.candidate.target.source_id ?? "", a.candidate.id]
        .join(":")
        .localeCompare(
          [b.candidate.kind, b.candidate.target.game_code ?? "", b.candidate.target.source_id ?? "", b.candidate.id].join(":"),
        ),
    );
  const limit = Math.max(1, Math.min(options.limit ?? 12, COVERAGE_HUNT_BOARD_LIMIT));

  return {
    candidates: filtered.slice(0, limit),
    available_candidate_count: filtered.length,
    returned_candidate_count: Math.min(filtered.length, limit),
    as_of: coverage.queried_at,
    walking_past_is_honored: true,
  };
}
