/**
 * GET /api/v1/cards/[sku]/evidence
 *
 * One exact-card evidence map. It composes already-public claim classes
 * without flattening their meaning or rights: reference != offer != sale
 * != consented community observation. Raw restricted source values,
 * identities and evidence commitments never enter the response. Person-
 * derived aggregate tables are not queried while publication is paused.
 */

import { NextResponse } from "next/server";
import { listSourceMeta } from "@cambridge-tcg/data-ingest";
import { errorResponse, jsonResponse } from "@/lib/data-pantry";
import { buildCardEvidence } from "@/lib/evidence/card";
import { getUnifiedMarketView } from "@/lib/market/unified";
import { retailPrice } from "@/lib/pricing";
import { parseSkuShape } from "@/lib/search/resolver";
import { fetchCard } from "@/lib/wholesale/client";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  const rawSku = decodeURIComponent((await params).sku).trim();
  if (!rawSku || rawSku.length > 120 || !parseSkuShape(rawSku)) {
    return errorResponse({
      code: "INVALID_SKU",
      message: "A full card SKU is required.",
      status: 400,
      endpoint: "/api/v1/cards/[sku]/evidence",
    });
  }

  let card = await fetchCard(rawSku).catch(() => null);
  let sku = rawSku;
  if (!card) {
    const alternate = rawSku === rawSku.toUpperCase() ? rawSku.toLowerCase() : rawSku.toUpperCase();
    if (alternate !== rawSku) {
      card = await fetchCard(alternate).catch(() => null);
      if (card) sku = card.sku;
    }
  }
  if (!card) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `No catalog card was found for '${rawSku}'.`,
      status: 404,
      endpoint: "/api/v1/cards/[sku]/evidence",
    });
  }

  const market = await getUnifiedMarketView(sku).catch(() => null);

  const model = buildCardEvidence({
    sku,
    game: parseSkuShape(sku)?.game ?? null,
    referenceAmountGbp: retailPrice(card.price_gbp, card.channel_price),
    referenceObservedAt: card.updated_at,
    market,
    sources: listSourceMeta(),
  });

  return jsonResponse({
    endpoint: "/api/v1/cards/[sku]/evidence",
    sources: [
      "wholesale-rds.cards",
      "storefront-rds.market_orders",
      "storefront sold-comps publication policy",
      "collector-observation publication policy",
      "@cambridge-tcg/data-ingest source registry",
    ],
    source_license: ["proprietary", "proprietary", "internal-only", "internal-only", "cc0"],
    license: "NOASSERTION",
    freshness: 300,
    as_of: card.updated_at ?? undefined,
    does_not_include: [
      "raw CardRush values or source URLs (internal-only)",
      "TCGplayer values (collection is blocked)",
      "buyer, seller, contributor, account, payment, shipping, or receipt identity",
      "individual community-observation rows or evidence SHA-256 commitments",
      "community-observation prices, counts, dates, conditions, or threshold totals while publication is paused",
      "completed-sale prices, counts, dates, conditions, or threshold totals while sold-comps publication is paused",
      "an assertion that a reference or live offer is a completed transaction",
    ],
    data: {
      "@kind": "card-evidence",
      ...model,
    },
  });
}

export async function OPTIONS(): Promise<NextResponse> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
