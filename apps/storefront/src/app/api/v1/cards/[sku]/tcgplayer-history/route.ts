/**
 * /api/v1/cards/[sku]/tcgplayer-history — explicit closed door.
 *
 * The written permission recorded 2026-10-28 covers collecting TCGplayer's
 * pages, attributed display on Cambridge pages and input to Cambridge-derived
 * data. Raw TCGplayer prices are display-only: no member API, download or
 * bulk copy, which migration 0139 enforces on the release row. So this route
 * never fetches or emits a TCGplayer value; derived data has its own routes
 * (/api/v1/market/*). The old signed-in history reading treated a
 * hypothetical partner tier as permission already held.
 *
 * Keep the route so clients receive an actionable machine-readable status.
 * `state` keeps its name, which scripts/deploy-verify-contract.ts pins.
 */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/cards/[sku]/tcgplayer-history";

export async function GET(): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "TCGplayer prices are not served by API. Under the written permission recorded 2026-10-28 they are display-only: shown with TCGplayer named on Cambridge pages and used as an input to Cambridge-derived data, never served through an API, a download or in bulk.",
    docs: "/methodology/data-intentions",
    endpoint: ENDPOINT,
    status: 503,
    details: {
      source: "tcgplayer",
      state: "blocked-by-upstream-terms",
      reopen_when:
        "Not planned. Serving raw TCGplayer prices would need a TCGplayer release for member API use, which the 2026-10-28 permission does not give and migration 0139 refuses.",
    },
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
