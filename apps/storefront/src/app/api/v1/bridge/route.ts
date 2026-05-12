/**
 * /api/v1/bridge — math as the universal language.
 *
 * Given any two public beings on the platform, computes a typed bridge
 * object: card overlap, language overlap, region match, cadence ratio,
 * trade potential, and a composite bridge_score. Pure compute over
 * existing substrate; no new tables, no caching.
 *
 * Usage:
 *   GET /api/v1/bridge?a=u:alice&b=u:bob
 *   GET /api/v1/bridge?a=c:tokyo-card-lounge&b=c:bristol-card-club
 *   GET /api/v1/bridge?a=u:alice&b=c:tokyo-card-lounge
 *
 * Prefix syntax:
 *   u:<username>   — a user, must be is_public=true
 *   c:<slug>       — a collective, must be is_public=true
 *
 * See docs/connections/the-universal-language.md for the doctrine and
 * /methodology/bridges for every formula.
 */

import type { NextRequest } from "next/server";
import {
  errorResponse,
  invalidSkuError,
  jsonResponse,
} from "@/lib/data-pantry";
import { BridgeError, parseBeingSpec } from "@/lib/bridge/types";
import { buildBridge } from "@/lib/bridge/compute";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const a = parseBeingSpec(req.nextUrl.searchParams.get("a"));
  const b = parseBeingSpec(req.nextUrl.searchParams.get("b"));

  if (!a || !b) {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        "Both a and b query params required. Format: u:<username> or c:<slug>. Example: /api/v1/bridge?a=u:alice&b=c:tokyo-card-lounge",
      status: 400,
    });
  }

  try {
    const bridge = await buildBridge(a, b);
    return jsonResponse({
      data: bridge,
      endpoint: "/api/v1/bridge",
      sources: ["ctcg-derived"],
      // 60s freshness for live-computed bridge scores.
      freshness: 60,
      contains_self: false,
    });
  } catch (e) {
    if (e instanceof BridgeError) {
      // Map the bridge module's gRPC-style codes onto the data-pantry's
      // canonical `ErrorCode` enum. The audit picked up the drift during
      // kingdom-067's stress test (see docs/connections/the-stress-test.md
      // §4). Future iteration consolidates BridgeError onto the data-spec
      // error codes directly.
      const mapped =
        e.code === "not_found"
          ? { code: "NOT_FOUND" as const, status: 404 }
          : e.code === "not_public"
            ? { code: "INSUFFICIENT_TIER" as const, status: 403 }
            : { code: "INVALID_INPUT" as const, status: 400 };
      return errorResponse({
        code: mapped.code,
        message: e.message,
        status: mapped.status,
      });
    }
    // Unknown — let the platform's default error handling surface it.
    throw e;
  }
}

// CORS: the bridge endpoint is a public-data surface; partners and agents
// fetching it from other origins must be able to.
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

// Keep the import alive (invalidSkuError isn't used here but the pantry
// surfaces it as a convention reminder; future bridge errors that turn
// out to be sku-shaped — e.g. a "u:foo bar" with invalid chars — could
// switch to it).
void invalidSkuError;
