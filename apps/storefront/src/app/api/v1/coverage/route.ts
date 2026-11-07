/**
 * /api/v1/coverage — public aggregator-coverage view.
 *
 * Public, no-auth envelope over the storefront's direct observation-database
 * ground route. Returns summary + by-game-source + by-game + by-source
 * breakdowns, stripped to operational metadata only:
 * counts, distinct-card numbers, date ranges, source identifiers. No upstream
 * price values — those remain withheld at both public and authenticated
 * participant-facing per-card endpoints.
 *
 * Cambridge dedicates whatever rights it holds in the aggregation shape and
 * explanatory metadata to CC0. The internal card-to-game mapping remains
 * proprietary, and upstream terms continue to govern upstream material.
 *
 * Filed for kingdom-085 — the aggregator presents its collected state.
 *
 * Substrate-honest about absence:
 *   - observation database unreachable → 503 error envelope
 *   - database reachable but empty → summary zeros + empty arrays
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import {
  isValidCoverageDate,
  isValidCoverageToken,
} from "@/lib/wholesale/db-source";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { legacyAcquisitionClosed } from "@cambridge-tcg/data-ingest/registry";

const AGGREGATION_SOURCE = "cambridge-tcg.coverage-aggregation";
const GAME_MAPPING_SOURCE = "cambridge-tcg.catalog-game-mapping";
const SOURCE_LICENSE_BY_ID: ReadonlyMap<string, string> = new Map(
  listSourceMeta().map((source) => [source.id, source.license] as const),
);
/** Sources whose legacy collection, the only path into this archive, is
 * closed: every blocked source, and CardRush and TCGplayer, whose legacy paths
 * stay locked in code while their status is partial for collectors that
 * write elsewhere. Read from the registry, so the list follows its locks. */
const LEGACY_COLLECTION_CLOSED: readonly string[] = listSourceMeta()
  .filter((source) => legacyAcquisitionClosed(source))
  .map((source) => source.id);

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.has("source")
    ? url.searchParams.get("source") ?? ""
    : undefined;
  const game = url.searchParams.has("game")
    ? url.searchParams.get("game") ?? ""
    : undefined;
  const since = url.searchParams.has("since")
    ? url.searchParams.get("since") ?? ""
    : undefined;

  if (source !== undefined && !isValidCoverageToken(source)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "source must be a 1-64 character identifier",
      docs: "/api/v1/coverage",
      endpoint: "/api/v1/coverage",
    });
  }
  if (game !== undefined && !isValidCoverageToken(game)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "game must be a 1-64 character identifier",
      docs: "/api/v1/coverage",
      endpoint: "/api/v1/coverage",
    });
  }
  if (since !== undefined && !isValidCoverageDate(since)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "since must be a real calendar date in YYYY-MM-DD format",
      docs: "/api/v1/coverage",
      endpoint: "/api/v1/coverage",
    });
  }

  const coverage = await fetchAggregatorCoverage({ source, game, since });

  if (coverage === null) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The wholesale observation database could not answer this bounded read. It may be unavailable or at current read capacity. Try again shortly; /api/v1/status surfaces platform-wide health.",
      docs: "/api/v1/status",
      status: 503,
      endpoint: "/api/v1/coverage",
    });
  }

  const data = {
    "@kind": "aggregator_coverage",
    description:
      "What the legacy observation archive holds. Per-(game × source) " +
      "observation counts, distinct-card counts, date ranges, and freshness. " +
      "Legacy collection into it is closed for the sources in legacy_collection_closed: those whose registry status (/api/v1/sources) is blocked, and those whose legacy path is locked in code. " +
      "Collectors, which run only while scheduled (see /api/v1/sources), write to the member feed, not here. " +
      "Operational metadata only. Cambridge dedicates whatever rights it holds " +
      "in the aggregation shape and explanations to CC0; the internal card-to-game " +
      "mapping remains proprietary, and upstream terms govern upstream material.",
    legacy_collection_closed: LEGACY_COLLECTION_CLOSED,
    summary: coverage.summary,
    by_game_source: coverage.by_game_source,
    by_game: coverage.by_game,
    by_source: coverage.by_source,
    filter: coverage.filter,
    upstream_queried_at: coverage.queried_at,
    legend: {
      legacy_collection_closed:
        "Registry ids whose legacy collection is closed: every blocked source, and each source whose legacy path is locked in code whatever its status. Their rows here are history.",
      observations:
        "Total rows in price_archive matching the filter (at most one row per card × snapshot_date × source × condition).",
      distinct_cards:
        "Unique cards (by card_id) observed at least once.",
      per_game_distinct_cards:
        "Exact unique-card union across every source attached to the game; distinct_cards_max is the largest single-source subset retained for compatibility.",
      unassigned_observations:
        "Archive rows whose card has no game assignment. Included in summary and per-source totals; omitted only from game-shaped breakdowns.",
      days_of_coverage:
        "Calendar days between earliest_snapshot and latest_snapshot inclusive.",
      freshest_age_hours:
        "Hours elapsed since latest_snapshot at end-of-day (rounded to 0.1). A source in legacy_collection_closed does not refresh here, so this age keeps growing.",
    },
    related: {
      registry: "/api/v1/sources",
      run_history_per_source: "/api/v1/sources/[id]",
      per_card_structural_view: "/api/v1/universal/card/[sku] (legacy price values null)",
      cardrush_history_status: "/api/v1/cards/[sku]/cardrush-history (values withheld)",
      bulk_catalog_status: "/data/catalog.jsonl (paused; zero card rows)",
    },
  };

  const upstreamLineage = Array.from(
    new Set(coverage.by_source.map((row) => row.source)),
  );

  return jsonResponse({
    data,
    endpoint: "/api/v1/coverage",
    sources: [AGGREGATION_SOURCE, GAME_MAPPING_SOURCE, ...upstreamLineage],
    source_license: [
      "cc0",
      "proprietary",
      ...upstreamLineage.map(
        (source) => SOURCE_LICENSE_BY_ID.get(source) ?? "proprietary",
      ),
    ],
    does_not_include: [
      "No upstream price value, collector record, account, message, or inferred relationship is included.",
      "CC0 applies only to rights Cambridge holds in the aggregation shape and explanatory metadata; the internal card-to-game mapping is proprietary, and upstream terms still govern upstream material.",
    ],
    license: "NOASSERTION",
    freshness: "status",
    as_of: coverage.queried_at,
    contains_self: true,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
