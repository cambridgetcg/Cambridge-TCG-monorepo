/**
 * /api/v1/search/cards — publication paused.
 *
 * Searching an internal-only mirror still reveals catalog existence and SKU
 * membership. NOASSERTION is not permission. This route reads no query body,
 * database, registry, or wholesale client until a public membership source is
 * approved.
 */

import { NextResponse } from "next/server";

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      error: {
        code: "CARD_SEARCH_PAUSED",
        message:
          "Public card search is paused because the mixed catalog mirror has no affirmative public membership lineage.",
      },
      searched: false,
      catalog_membership_included: false,
      matches: [],
      matches_complete: false,
      does_not_include: [
        "existence or zero-match assertions",
        "SKUs, games, sets, languages, or variants",
        "names, images, rarity, prices, stock, or source URLs",
        "database, registry, or wholesale requests",
      ],
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
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
