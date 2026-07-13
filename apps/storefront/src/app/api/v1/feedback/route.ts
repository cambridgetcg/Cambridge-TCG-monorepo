/** Public feedback persistence is paused pending bounded consent and erasure. */

import { errorResponse, jsonResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/feedback";
export const PUBLIC_FEEDBACK_PERSISTENCE_ENABLED = false as const;

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: ENDPOINT,
    sources: ["feedback-publication-policy"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    freshness: "methodology",
    no_cache: true,
    contains_self: true,
    data: {
      "@kind": "feedback-status",
      status: "feedback-disabled",
      persistence_enabled: PUBLIC_FEEDBACK_PERSISTENCE_ENABLED,
      rows: [],
      post_behavior:
        "Returns 503 before inspecting or logging the body and before accessing the database.",
      contact: "contact@cambridgetcg.com",
      contact_note:
        "Email is an external communication channel with its own provider delivery logs and retention; no promise of anonymous or no-log feedback is made.",
      reopening_requires: [
        "strict field and whole-request size bounds",
        "per-source and global abuse controls",
        "versioned retention and contact notice",
        "holder-authenticated status and deletion",
        "redacted operational logging",
      ],
      walking_past_is_honored: true,
    },
  });
}

export async function POST(_request?: Request): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "Public feedback persistence is paused. No request body or contact field was inspected or logged, and no database row was read or written.",
    endpoint: ENDPOINT,
    details: {
      status: "feedback-disabled",
      body_inspected: false,
      logged: false,
      database_accessed: false,
      status_url: ENDPOINT,
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
