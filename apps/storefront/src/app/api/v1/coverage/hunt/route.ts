/**
 * GET /api/v1/coverage/hunt — public, read-only invitation board.
 *
 * Candidates are derived from the existing declared-vs-observed coverage
 * matrix. They contain operational counts and dates only. Playing happens
 * through three bearer-authenticated MCP turns; nothing on this route creates
 * a case, watches a person, or changes catalog/source/price data.
 */

import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import {
  COVERAGE_CANDIDATE_KINDS,
  COVERAGE_HUNT_RESOLUTIONS,
  COVERAGE_HUNT_ROLES,
  COVERAGE_HUNT_STATUSES,
  type CoverageCandidateKind,
} from "@/lib/coverage-hunt/types";
import {
  buildCoverageHuntBoard,
  COVERAGE_HUNT_BOARD_LIMIT,
} from "@/lib/coverage-hunt/board";
import { fetchAggregatorCoverage } from "@/lib/wholesale/client";
import { isValidCoverageToken } from "@/lib/wholesale/db-source";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || undefined;
  const rawKind = url.searchParams.get("kind") || undefined;
  const rawLimit = url.searchParams.get("limit");

  if (game && !isValidCoverageToken(game)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: "game must be a 1-64 character identifier.",
      endpoint: "/api/v1/coverage/hunt",
    });
  }
  if (
    rawKind &&
    !(COVERAGE_CANDIDATE_KINDS as readonly string[]).includes(rawKind)
  ) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `kind must be one of: ${COVERAGE_CANDIDATE_KINDS.join(", ")}.`,
      endpoint: "/api/v1/coverage/hunt",
    });
  }
  const limit = rawLimit === null ? 12 : Number(rawLimit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > COVERAGE_HUNT_BOARD_LIMIT) {
    return errorResponse({
      code: "INVALID_INPUT",
      message: `limit must be an integer from 1 to ${COVERAGE_HUNT_BOARD_LIMIT}.`,
      endpoint: "/api/v1/coverage/hunt",
    });
  }

  const coverage = await fetchAggregatorCoverage({ game });
  if (!coverage) {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The observation coverage database is unavailable, so no hunt candidate can be claimed as current.",
      docs: "/api/v1/status",
      status: 503,
      endpoint: "/api/v1/coverage/hunt",
    });
  }

  const sources = listSourceMeta();
  const board = buildCoverageHuntBoard(coverage, sources, {
    game,
    kind: rawKind as CoverageCandidateKind | undefined,
    limit,
  });
  const upstreamLineage = Array.from(
    new Set(coverage.by_source.map((row) => row.source)),
  );
  const licenseBySource = new Map(
    sources.map((source) => [source.id as string, source.license] as const),
  );

  return jsonResponse({
    endpoint: "/api/v1/coverage/hunt",
    sources: ["cambridge-tcg.coverage-hunt-board", ...upstreamLineage],
    source_license: [
      "cc0",
      ...upstreamLineage.map((source) => licenseBySource.get(source) ?? "proprietary"),
    ],
    license: "CC0-1.0",
    freshness: "status",
    as_of: coverage.queried_at,
    contains_self: true,
    does_not_include: [
      "price values, raw upstream content, collector observations, accounts, identities, messages, or inferred relationships",
      "blocked or planned source paths as acquisition tasks",
      "any score, prize, ranking, background worker, surveillance, or penalty for walking past",
      "an apply transition: accepted cases remain proposals for a separate human-operated workflow",
    ],
    data: {
      "@kind": "coverage-hunt-board",
      board,
      game_contract: {
        roles: COVERAGE_HUNT_ROLES,
        order: ["scout", "checker", "mirror", "human review"],
        statuses: COVERAGE_HUNT_STATUSES,
        human_resolutions: COVERAGE_HUNT_RESOLUTIONS,
        duration_hours: 72,
        next_role_is_inferred_from_state: true,
        three_distinct_agents_required: true,
        immutable_turn_content: true,
        erasable_live_agent_link: true,
        observer_effect_is_explicit: true,
        authoritative_effect: "none",
        apply_transition_exists: false,
        human_review_required: true,
        walking_past_is_honored: true,
      },
      play_via: {
        transport: "MCP tools/call or Cambridge dotted JSON-RPC",
        endpoint: "/api/mcp",
        read_authority: "existing bearer key",
        contribute_authority: "operator-managed agent",
        tools: [
          "coverage.hunt.list",
          "coverage.hunt.view",
          "coverage.hunt.contribute",
          "coverage.hunt.my_cases",
        ],
      },
      methodology: {
        repository_path: "docs/connections/the-coverage-hunt.md",
        observed_coverage: "/api/v1/coverage",
        agent_tool_catalog: "/api/mcp/catalog?category=coverage",
      },
    },
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
