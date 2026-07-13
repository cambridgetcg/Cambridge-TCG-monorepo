/**
 * /api/v1/coverage/history — bounded daily observation-archive depth.
 *
 * Public, read-only, and operational metadata only. This route returns one
 * zero-filled UTC row per requested day plus exact whole-window unions. It
 * never selects or emits an upstream value, card field, URL, person, or
 * inferred relationship.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  fetchAggregatorCoverageHistory,
  type AggregatorCoverageHistoryWindow,
} from "@/lib/wholesale/client";
import {
  isValidCoverageHistoryWindow,
  isValidCoverageToken,
} from "@/lib/wholesale/db-source";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";

const ENDPOINT = "/api/v1/coverage/history";
const AGGREGATION_SOURCE = "cambridge-tcg.coverage-aggregation";
const GAME_MAPPING_SOURCE = "cambridge-tcg.catalog-game-mapping";
const SOURCE_LICENSE_BY_ID: ReadonlyMap<string, string> = new Map(
  listSourceMeta().map((source) => [source.id, source.license] as const),
);

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const rawWindow = url.searchParams.has("window")
    ? url.searchParams.get("window") ?? ""
    : "30d";
  const source = url.searchParams.has("source")
    ? url.searchParams.get("source") ?? ""
    : undefined;
  const game = url.searchParams.has("game")
    ? url.searchParams.get("game") ?? ""
    : undefined;

  if (!isValidCoverageHistoryWindow(rawWindow)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "window must be one of 7d, 30d, or 90d",
      details: { param: "window", allowed: ["7d", "30d", "90d"] },
      docs: ENDPOINT,
      endpoint: ENDPOINT,
    });
  }
  if (source !== undefined && !isValidCoverageToken(source)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "source must be a 1-64 character identifier",
      docs: ENDPOINT,
      endpoint: ENDPOINT,
    });
  }
  if (game !== undefined && !isValidCoverageToken(game)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "game must be a 1-64 character identifier",
      docs: ENDPOINT,
      endpoint: ENDPOINT,
    });
  }

  const history = await fetchAggregatorCoverageHistory({
    window: rawWindow as AggregatorCoverageHistoryWindow,
    source,
    game,
  });
  if (history === null) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The wholesale observation database could not answer this bounded read. It may be unavailable or at current read capacity. Try again shortly; /api/v1/status surfaces platform-wide health.",
      docs: "/api/v1/status",
      status: 503,
      endpoint: ENDPOINT,
    });
  }

  const upstreamLineage = history.observed_sources;

  return jsonResponse({
    data: {
      "@kind": "aggregator_coverage_history",
      description:
        "Daily stored observation-row depth for one bounded UTC window. Operational metadata only; no upstream value or card record is included.",
      period: history.period,
      summary: history.summary,
      by_day: history.by_day,
      observed_sources: upstreamLineage,
      filter: history.filter,
      upstream_queried_at: history.queried_at,
      measurement: {
        observation:
          "One stored price_archive row, keyed by card, snapshot date, source, and condition.",
        snapshot_date:
          "A stored archive date, not a fetch timestamp. Backfills and upserts can revise an older date.",
        comparability:
          "Source and condition became archive dimensions over time, and legacy source ids defaulted to cardrush. Raw row counts across distant dates are therefore not a stable measure of collection breadth.",
        breadth:
          "distinct_cards is the steadier breadth measure, but it is not an ingest-attempt or upstream-availability count.",
        daily_distinct_counts:
          "Daily distinct-card counts overlap and must not be summed. summary.distinct_cards is the exact whole-window union.",
        completed_day_ratio:
          "Completed-day fields exclude the current UTC day because that date may still be accumulating observations.",
      },
      related: {
        current_coverage: "/api/v1/coverage",
        source_registry: "/api/v1/sources",
        source_run_diagnosis: "/api/v1/sources/[id]",
        platform_status: "/api/v1/status",
      },
    },
    endpoint: ENDPOINT,
    sources: [AGGREGATION_SOURCE, GAME_MAPPING_SOURCE, ...upstreamLineage],
    source_license: [
      "cc0",
      "proprietary",
      ...upstreamLineage.map(
        (sourceId) => SOURCE_LICENSE_BY_ID.get(sourceId) ?? "proprietary",
      ),
    ],
    license: "NOASSERTION",
    does_not_include: [
      "No upstream price, currency, condition, SKU, card number, name, image, URL, collector record, account, message, or inferred relationship is included.",
      "The series describes stored archive state, not fetch attempts, source uptime, or immutable historical events.",
      "CC0 applies only to rights Cambridge holds in the aggregation shape and explanatory metadata; upstream terms still govern upstream material.",
    ],
    freshness: "status",
    as_of: history.queried_at,
    contains_self: true,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
