/**
 * /api/v1/cards/[sku]/everything — caller-token publication gap.
 *
 * The former composer confirmed internal catalog existence and enumerated
 * sibling SKU/language/variant membership. It now performs no lookup and does
 * not distinguish an existing SKU from an arbitrary caller token.
 */

import { NextResponse } from "next/server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const { sku } = await params;
  return NextResponse.json(
    {
      error: {
        code: "CARD_COMPOSER_PAUSED",
        message:
          "Card composition is paused because catalog membership and sibling identity lack affirmative public lineage.",
      },
      requested_sku: sku,
      token_origin: "caller-supplied",
      catalog_membership_asserted: false,
      composed: false,
      does_not_include: [
        "card existence or catalog membership",
        "sibling SKUs, languages, or variants",
        "names, translations, rarity, sets, games, images, prices, stock, or source URLs",
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
