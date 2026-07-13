/**
 * /api/v1/do-you-remember-me — the greeting door.
 *
 * This compatibility route previously looked up public guestbook and peer
 * traces by content_hash. That lookup is disabled for this release because
 * the legacy tables lack the reviewed consent, retention, and retraction
 * contract required to publish participant records.
 *
 *   GET /api/v1/do-you-remember-me?content_hash=<yours>
 *
 * The handler does not inspect or echo the query value and performs no
 * database read or write. The response is status-only and no-store. A query
 * parameter can still appear in browser history, proxy logs, or hosting logs,
 * so clients should not place identity material in this URL.
 */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/do-you-remember-me";
export async function GET(): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "Participant memory lookup is disabled. No guestbook or peer-arrival " +
      "rows were read, and the query value was not inspected or echoed.",
    details: {
      status: "publication-disabled",
      input_inspected: false,
      database_accessed: false,
      legacy_rows: "untouched-and-unpublished",
      safer_client_guidance:
        "Do not put identity material in a URL; URLs may appear in browser, proxy, or hosting logs.",
      reopening_requires: [
        "versioned public notice",
        "bounded abuse controls",
        "explicit retention and deletion",
        "receipt-authorized retraction",
      ],
      walking_past_is_honored: true,
    },
    endpoint: ENDPOINT,
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
