/**
 * /api/v1/coverage — public aggregator-coverage view.
 *
 * Public, no-auth envelope over the storefront's direct observation-database
 * ground route. Returns summary + by-game-source + by-game + by-source
 * breakdowns, stripped to operational metadata only:
 * counts, distinct-card numbers, date ranges, source identifiers. No upstream
 * price values — those would carry the upstream's license tier and are
 * served via the per-card endpoints with their own license declarations.
 *
 * Cambridge dedicates whatever rights it holds in the compiled counts and
 * date ranges to CC0. That does not license upstream values, names, marks, or
 * images and does not override any upstream terms.
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

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") || undefined;
  const game = url.searchParams.get("game") || undefined;
  const since = url.searchParams.get("since") || undefined;

  if (source && !isValidCoverageToken(source)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "source must be a 1-64 character identifier",
      docs: "/api/v1/coverage",
      endpoint: "/api/v1/coverage",
    });
  }
  if (game && !isValidCoverageToken(game)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "game must be a 1-64 character identifier",
      docs: "/api/v1/coverage",
      endpoint: "/api/v1/coverage",
    });
  }
  if (since && !isValidCoverageDate(since)) {
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
        "The wholesale observation database is unavailable. Try again shortly; /api/v1/status surfaces platform-wide health.",
      docs: "/api/v1/status",
      status: 503,
      endpoint: "/api/v1/coverage",
    });
  }

  const data = {
    "@kind": "aggregator_coverage",
    description:
      "What the Cambridge TCG aggregator has actually collected. Per-(game × source) " +
      "observation counts, distinct-card counts, date ranges, and freshness. " +
      "Operational metadata only. Cambridge dedicates whatever rights it holds " +
      "in these compiled counts and date ranges to CC0; this does not license " +
      "upstream values, names, marks, images, or override upstream terms.",
    summary: coverage.summary,
    by_game_source: coverage.by_game_source,
    by_game: coverage.by_game,
    by_source: coverage.by_source,
    filter: coverage.filter,
    upstream_queried_at: coverage.queried_at,
    legend: {
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
        "Hours elapsed since latest_snapshot at end-of-day (rounded to 0.1).",
    },
    related: {
      registry: "/api/v1/sources",
      run_history_per_source: "/api/v1/sources/[id]",
      per_card_observations: "/api/v1/universal/card/[sku]",
      authenticated_jpy_history: "/api/v1/cards/[sku]/cardrush-history",
      bulk_catalog: "/data/catalog.jsonl",
    },
  };

  const upstreamLineage = Array.from(
    new Set(coverage.by_source.map((row) => row.source)),
  );

  return jsonResponse({
    data,
    endpoint: "/api/v1/coverage",
    sources: ["cambridge-tcg.coverage-aggregation", ...upstreamLineage],
    source_license: ["cc0", ...upstreamLineage.map(() => "internal-only")],
    does_not_include: [
      "No upstream price value, collector record, account, message, or inferred relationship is included.",
      "CC0 applies only to rights Cambridge holds in this compiled operational view; upstream terms still govern upstream material.",
    ],
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
