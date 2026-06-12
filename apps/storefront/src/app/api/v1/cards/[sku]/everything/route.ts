/**
 * GET /api/v1/cards/[sku]/everything
 *
 * The composer half of kingdom-090 — given a canonical SKU, return
 * everything the platform knows about that card in one envelope:
 * price across every source, history (cardrush + tcgplayer), siblings
 * across languages, and the platform's own quote.
 *
 * Yu's directive: *"POOF!!!! PRICE, TRANSACTION HISTORIES, AVAILABLE
 * SOURCES, DIFFERENT LANGUAGE ALL POPS UP!"* This route is the POOF.
 *
 * The composition engine lives in `@/lib/search/composer` — shared
 * in-process with /api/v1/search/everything so the convenience endpoint
 * no longer pays a same-origin HTTP hop per search. This route is the
 * stable public HTTP contract over that engine; the response shape is
 * unchanged.
 *
 * Freshness budget: market_signal. Mixed license — see composer.ts.
 */

import { NextRequest } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { composeEverything } from "@/lib/search/composer";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ sku: string }> },
) {
  const { sku: rawSku } = await ctx.params;

  const result = await composeEverything(rawSku);

  if (!result.ok) {
    if (result.error === "invalid_sku") {
      return errorResponse({
        code: "INVALID_SKU",
        message:
          `'${rawSku}' is not a canonical SKU. Expected '<game>-<set>-<number>-<lang>[-<variant>]' (e.g. 'op-op01-001-ja' or legacy 'OP-OP01-001-JP-V11DZ').`,
        docs: "/methodology/sku-standard",
      });
    }
    return errorResponse({
      code: "NOT_FOUND",
      message: `Card '${result.sku}' not found in the wholesale catalog.`,
      details: { sku: result.sku },
    });
  }

  return jsonResponse({
    endpoint: "/api/v1/cards/[sku]/everything",
    data: result.data,
    sources: result.sources,
    source_license: result.source_license,
    ...(result.upstream_proxy ? { upstream_proxy: result.upstream_proxy } : {}),
    freshness: "market_signal",
    as_of: result.as_of,
  });
}
