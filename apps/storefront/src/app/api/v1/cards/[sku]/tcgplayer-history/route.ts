/**
 * /api/v1/cards/[sku]/tcgplayer-history — explicit blocked door.
 *
 * Cambridge has no recorded TCGplayer credentials or written approval.
 * TCGplayer is not granting new API access, and its current terms prohibit
 * combining its pricing with first- or third-party pricing — the operation
 * this platform was designed to perform. The old signed-in history reading
 * incorrectly treated a hypothetical partner tier as permission already held.
 *
 * Keep the route so clients receive an actionable machine-readable status;
 * never fetch or emit TCGplayer observations until written approval explicitly
 * covers Cambridge's multi-source aggregation and display use.
 */

import { errorResponse } from "@/lib/data-pantry";

const ENDPOINT = "/api/v1/cards/[sku]/tcgplayer-history";

export async function GET(): Promise<Response> {
  return errorResponse({
    code: "SOURCE_UNAVAILABLE",
    message:
      "TCGplayer data is unavailable: Cambridge has no recorded API approval, and current TCGplayer terms prohibit this multi-source pricing use without prior written consent.",
    docs: "/methodology/data-intentions",
    endpoint: ENDPOINT,
    status: 503,
    details: {
      source: "tcgplayer",
      state: "blocked-by-upstream-terms",
      reopen_when:
        "Written approval explicitly covers Cambridge TCG's multi-source aggregation and display use.",
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
