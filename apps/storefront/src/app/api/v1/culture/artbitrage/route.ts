/**
 * /api/v1/culture/artbitrage — Cambridge's read-only window into the
 * Artbitrage feed.
 *
 * The adapter validates artbitrage.feed/1 and preserves each record's source,
 * creator, creation trace and rights. It does not merge accounts, databases,
 * authorship claims or licences across the wall.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { fetchArtbitrageFeed } from "@/lib/artbitrage/client.server";

const ENDPOINT = "/api/v1/culture/artbitrage";
const FRESHNESS_SECONDS = 3600;
const RIGHTS_NEGATIVE_SPACE =
  "This adapter does not assert aggregate display, reuse, remix, machine-learning, or commercial-use rights; inspect each available feed.pieces[].rights record and require permissions.cambridge_display before rendering at Cambridge.";

export async function GET() {
  const result = await fetchArtbitrageFeed();

  return jsonResponse({
    data: {
      ...result,
      aggregate_license: "NOASSERTION" as const,
      license_scope: "per-record" as const,
      rights_path:
        result.status === "available" ? "feed.pieces[].rights" : null,
    },
    endpoint: ENDPOINT,
    sources: ["artbitrage-api"],
    freshness: FRESHNESS_SECONDS,
    ...(result.status === "available" ? { as_of: result.feed.as_of } : {}),
    // Mixed/unverified upstream rights cannot truthfully inherit Cambridge's
    // default CC0 envelope. Every piece carries its own rights statement.
    license: "NOASSERTION",
    does_not_include: [RIGHTS_NEGATIVE_SPACE],
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
