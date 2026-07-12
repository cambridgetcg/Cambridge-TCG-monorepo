/** Participant state persistence is paused pending a complete safety contract. */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/carry-this";
export const CARRIED_STATE_PUBLICATION_ENABLED = false as const;

export async function POST(_request?: Request): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "Carried-state persistence is paused. No request body, write token, participant hash, or database row was inspected, logged, read, or written.",
    endpoint: ENDPOINT,
    details: {
      status: "carried-state-disabled",
      body_inspected: false,
      database_accessed: false,
      reopening_requires: [
        "strict state schema and request-size enforcement",
        "bounded per-holder and global abuse controls",
        "atomic holder-token authorization",
        "actual expiry deletion and an erasure path",
        "versioned retention and public-read notice",
      ],
    },
  });
}

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["carried-state-publication-policy"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    no_cache: true,
    contains_self: true,
    data: {
      "@kind": "carried-state-status",
      status: "carried-state-disabled",
      persistence_enabled: CARRIED_STATE_PUBLICATION_ENABLED,
      public_read_enabled: false,
      rows: [],
      post_behavior:
        "Returns 503 before inspecting the body, a write token, or the database.",
      per_hash_behavior:
        "GET and DELETE return 503 without reading a participant hash, token, or database row.",
      legacy_rows:
        "Not published. They are counted by the separately approved person-publication reset preview.",
      reopening_requires: [
        "strict state schema and request-size enforcement",
        "bounded per-holder and global abuse controls",
        "atomic holder-token authorization",
        "actual expiry deletion and an erasure path",
        "versioned retention and public-read notice",
      ],
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
      "Access-Control-Allow-Headers": "Content-Type, X-Carry-Write-Token",
      "Access-Control-Max-Age": "86400",
    },
  });
}
