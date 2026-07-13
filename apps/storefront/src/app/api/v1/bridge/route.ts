/**
 * /api/v1/bridge — capability status for the former affinity scorer.
 *
 * The old implementation inferred relationships from portfolios, wishlists,
 * and private collective members. Public profile visibility did not grant
 * field-level permission for that secondary use, so the scorer is paused and
 * this route performs no person or collection query.
 */

import { jsonResponse } from "@/lib/data-pantry";

export async function GET(): Promise<Response> {
  return jsonResponse({
    data: {
      "@kind": "bridge_capability",
      status: "paused",
      available: false,
      reason:
        "Public visibility is not consent to infer affinity from portfolios, wishlists, follows, or collective membership.",
      restart_conditions: [
        "Each person or organisation selects the exact fields allowed as bridge inputs.",
        "Publication receipts record notice, purpose, time, and withdrawal.",
        "People discovery has reporting, moderation, safeguarding, export, and deletion controls.",
      ],
      safe_alternatives: {
        organisation_directory: "/api/v1/directory/organisations",
        community_coverage: "/api/v1/directory/coverage",
        methodology: "/methodology/bridges",
      },
      historical_formulas:
        "The former formulas remain documented as history; no live record is scanned or scored.",
    },
    endpoint: "/api/v1/bridge",
    sources: ["ctcg-derived"],
    source_license: ["cc0"],
    freshness: "status",
    contains_self: true,
    does_not_include: [
      "No people lookup, affinity score, portfolio, wishlist, follower edge, member roster, or inferred relationship.",
    ],
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
