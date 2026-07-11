/**
 * /api/v1/coverage — public aggregator-coverage view.
 *
 * Public, no-auth, CC0 envelope. The storefront-side mirror of wholesale's
 * /api/v1/aggregator/coverage. Returns the same summary + by-game-source +
 * by-game + by-source breakdowns, but stripped to operational metadata only:
 * counts, distinct-card numbers, date ranges, source identifiers. No upstream
 * price values — those would carry the upstream's license tier and are
 * served via the per-card endpoints with their own license declarations.
 *
 * The CC0 declaration on this endpoint is honest: aggregator-state metadata
 * (counts, dates, source ids, game ids) is Cambridge TCG's own substrate
 * observation discipline — we own the fact that we have observed N cards on
 * D dates from source S. The upstream license boundary applies to the
 * *values* of those observations, not to their *existence*.
 *
 * Filed for kingdom-085 — the aggregator presents its collected state.
 *
 * Substrate-honest about absence:
 *   - wholesale unreachable → 503-style envelope with _meta.degraded
 *   - wholesale reachable but empty → summary zeros + empty arrays
 */

import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? undefined;
  const game = url.searchParams.get("game") ?? undefined;
  const since = url.searchParams.get("since") ?? undefined;

  if (since && !/^\d{4}-\d{2}-\d{2}$/.test(since)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "since must be YYYY-MM-DD",
      docs: "/api/v1/coverage",
    });
  }

  const coverage = await fetchAggregatorCoverage({ source, game, since });

  if (coverage === null) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The wholesale aggregator endpoint is unreachable. Substrate-honest about absence: try again shortly. /api/v1/status surfaces platform-wide health.",
      docs: "/api/v1/status",
      status: 503,
    });
  }

  const data = {
    "@kind": "aggregator_coverage",
    description:
      "What the Cambridge TCG aggregator has actually collected. Per-(game × source) " +
      "observation counts, distinct-card counts, date ranges, and freshness. " +
      "Operational metadata; CC0. The upstream license boundary applies to the " +
      "VALUES of observations (served per-card with their own license declarations); " +
      "this endpoint emits only counts + dates + ids.",
    summary: coverage.summary,
    by_game_source: coverage.by_game_source,
    by_game: coverage.by_game,
    by_source: coverage.by_source,
    filter: coverage.filter,
    upstream_queried_at: coverage.queried_at,
    legend: {
      observations:
        "Total rows in price_archive matching the filter (one row per card × snapshot_date × source).",
      distinct_cards:
        "Unique cards (by card_id) observed at least once.",
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

  return jsonResponse({
    data,
    endpoint: "/api/v1/coverage",
    sources: ["wholesale-rds.price_archive", "wholesale-rds.games"],
    source_license: ["cc0", "cc0"], // tier slugs per envelope-contract; SPDX belongs on _meta.license
    freshness: "status",
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
