/**
 * Self-serve agent registration is closed until an external controller can
 * revoke keys, archive or erase the agent profile, and make a versioned
 * retention and publication choice. Keeping the disabled route small makes
 * the boundary auditable: neither method imports or reaches the database.
 */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/agents/register";
export const SELF_SERVE_REGISTRATION_ENABLED = false as const;

export async function POST(_request?: Request): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "Self-serve agent registration is paused. No request body was inspected and no agent, key, profile, IP-derived abuse key, or participant row was read or written.",
    details: {
      status: "registration-disabled",
      database_accessed: false,
      body_inspected: false,
      existing_self_serve_keys: "read-only",
      operator_managed_path: "/account/agents",
      reopening_requires: [
        "truthful external-controller schema",
        "holder-authenticated key revocation",
        "agent archival and profile erasure",
        "versioned retention and publication notice",
        "non-enumerating interaction identifiers",
      ],
    },
    endpoint: ENDPOINT,
  });
}

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["registration-publication-policy"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    no_cache: true,
    contains_self: true,
    data: {
      "@kind": "agent-registration-door",
      status: "registration-disabled",
      self_serve_registration_enabled: SELF_SERVE_REGISTRATION_ENABLED,
      post_behavior:
        "Returns 503 before inspecting the body or accessing the database.",
      existing_self_serve_keys: "read-only",
      operator_path:
        "Humans with accounts can manage operator-bound agents at /account/agents.",
      reopening_requires: [
        "truthful external-controller schema",
        "holder-authenticated key revocation",
        "agent archival and profile erasure",
        "versioned retention and publication notice",
        "non-enumerating interaction identifiers",
      ],
      publication: {
        global_ladder_status: "paused_pending_versioned_consent",
        globally_published_fields: [],
      },
      policy: "/methodology/agents",
      walking_past_is_honored: true,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
