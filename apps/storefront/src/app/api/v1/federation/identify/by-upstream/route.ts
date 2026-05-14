/**
 * GET /api/v1/federation/identify/by-upstream
 *
 * Federation reverse-lookup: a partner with an upstream identifier (a
 * TCGplayer productId+subType, a TCGplayer skuId — and in future kingdoms
 * Cardmarket idProduct + idLanguage, eBay listingId, Scryfall id, etc.)
 * resolves it back to a Cambridge canonical SKU + content_hash.
 *
 * The platform's existing `/api/v1/federation/identify/[hash]` resolves a
 * content_hash → canonical SKU. This endpoint is its **inverse-by-source**:
 * (upstream_source, upstream_id) → canonical SKU + content_hash.
 *
 * Public; CC0 envelope. The response carries identity-only — no pricing,
 * no license-restricted bytes. Cambridge owns the mapping table that does
 * the resolution; the partner owns the upstream id.
 *
 * ── Query shape ─────────────────────────────────────────────────────
 *
 *   ?source=tcgplayer&product_id=12345
 *     → resolves via cards.tcgplayer_product_id
 *       (when 2+ cards match, returns 409 with the disambiguation hint)
 *
 *   ?source=tcgplayer&product_id=12345&sub_type=Foil
 *     → disambiguated path
 *
 *   ?source=tcgplayer&sku_id=67890
 *     → resolves via card_tcgplayer_sku_ids
 *       (returns the per-condition leaf info too)
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-080
 * follow-up). Pairs with the wholesale resolver at /api/v1/tcgplayer/resolve.
 *
 * Future: Cardmarket / eBay / Scryfall sources slot in by adding their
 * resolution paths below. The contract stays stable.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { fetchTcgplayerResolve } from "@/lib/wholesale/client";
import { buildUniversalCard } from "@/lib/universal/card";

const SUPPORTED_SOURCES = new Set(["tcgplayer"]);

interface ByUpstreamBody {
  source: string;
  inputs: Record<string, string | number | null>;
  resolved: {
    canonical_sku: string;
    content_hash: string;
    card_id: number;
    upstream_product_id: number | null;
    upstream_sub_type: string | null;
    /** Present only when input was a leaf id (condition known). */
    condition: string | null;
    language: string | null;
  } | null;
  ambiguous?: boolean;
  ambiguity_hint?: string;
  /** Substrate-honest declaration of how the resolution was performed. */
  resolution_method: "product_id+sub_type" | "sku_id" | "ambiguous-product-id" | "not_found";
  notes: string;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const source = url.searchParams.get("source") ?? "";

  if (!source) {
    return errorResponse({
      code: "MISSING_PARAM",
      message:
        "?source= required (e.g. ?source=tcgplayer&product_id=12345). " +
        `Supported sources: ${Array.from(SUPPORTED_SOURCES).join(", ")}.`,
    });
  }

  if (!SUPPORTED_SOURCES.has(source)) {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        `source '${source}' not supported by federation reverse-lookup yet. ` +
        `Supported: ${Array.from(SUPPORTED_SOURCES).join(", ")}. ` +
        `Future kingdoms add cardmarket / ebay / scryfall.`,
    });
  }

  if (source === "tcgplayer") {
    const productIdParam = url.searchParams.get("product_id");
    const subTypeParam = url.searchParams.get("sub_type");
    const skuIdParam = url.searchParams.get("sku_id");

    const productId = productIdParam ? parseInt(productIdParam, 10) : undefined;
    const skuId = skuIdParam ? parseInt(skuIdParam, 10) : undefined;

    if (!productId && !skuId) {
      return errorResponse({
        code: "MISSING_PARAM",
        message:
          "Supply either ?product_id=&[sub_type=] OR ?sku_id= for source=tcgplayer.",
      });
    }
    if (productIdParam && !Number.isFinite(productId)) {
      return errorResponse({
        code: "INVALID_INPUT",
        message: "product_id must be an integer",
      });
    }
    if (skuIdParam && !Number.isFinite(skuId)) {
      return errorResponse({
        code: "INVALID_INPUT",
        message: "sku_id must be an integer",
      });
    }

    const upstream = await fetchTcgplayerResolve({
      product_id: productId,
      sub_type: subTypeParam ?? undefined,
      sku_id: skuId,
    });

    // Falcon failed (network / 5xx / parse). Don't lie about it.
    if (upstream === null) {
      return errorResponse({
        code: "SOURCE_UNAVAILABLE",
        message:
          "wholesale federation resolver is unreachable; cannot answer right now. " +
          "Retry after a short backoff.",
      });
    }

    const inputs: Record<string, string | number | null> = {
      product_id: productId ?? null,
      sub_type: subTypeParam ?? null,
      sku_id: skuId ?? null,
    };

    // Ambiguous: 2+ Cambridge cards matched the productId alone.
    if (upstream.ambiguous) {
      const body: ByUpstreamBody = {
        source,
        inputs,
        resolved: null,
        ambiguous: true,
        ambiguity_hint:
          upstream.message ??
          "Multiple Cambridge SKUs share this product_id; supply &sub_type= to disambiguate.",
        resolution_method: "ambiguous-product-id",
        notes:
          "Re-issue the request with one of the sub_types reported by TCGplayer for this product " +
          "(typically 'Normal', 'Foil', or 'Reverse Holofoil'). The Cambridge SKU's variant tail " +
          "is what discriminates here.",
      };
      return jsonResponse({
        data: body,
        endpoint: "/api/v1/federation/identify/by-upstream",
        sources: ["wholesale-rds.cards", "wholesale-rds.card_tcgplayer_sku_ids"],
        source_license: ["cc0", "cc0"],
        freshness: "identity",
      });
    }

    if (!upstream.resolved) {
      const body: ByUpstreamBody = {
        source,
        inputs,
        resolved: null,
        resolution_method: "not_found",
        notes:
          `No Cambridge mapping for this ${skuId !== undefined ? "sku_id" : "product_id"}. ` +
          "Either the upstream id was never seeded (run pnpm wholesale tcgplayer:seed-set), " +
          "or the upstream withdrew the product after our last walk.",
      };
      return jsonResponse({
        data: body,
        endpoint: "/api/v1/federation/identify/by-upstream",
        sources: ["wholesale-rds.cards", "wholesale-rds.card_tcgplayer_sku_ids"],
        source_license: ["cc0", "cc0"],
        freshness: "identity",
      });
    }

    // Resolved — also compute the content_hash so the partner gets a full
    // identity triple back. buildUniversalCard returns null when the
    // canonical SKU isn't in the storefront's `card_set_cards` catalog
    // (rare — but substrate-honest about that gap).
    const universal = await buildUniversalCard(upstream.resolved.canonical_sku);

    const body: ByUpstreamBody = {
      source,
      inputs,
      resolved: {
        canonical_sku: upstream.resolved.canonical_sku,
        content_hash: universal?.contentHash ?? "(unmaterialized: card not in storefront catalog)",
        card_id: upstream.resolved.card_id,
        upstream_product_id: upstream.resolved.tcgplayer_product_id || null,
        upstream_sub_type: upstream.resolved.tcgplayer_sub_type,
        condition: upstream.resolved.condition,
        language: upstream.resolved.language,
      },
      resolution_method: skuId !== undefined ? "sku_id" : "product_id+sub_type",
      notes:
        universal === null
          ? "Resolved in wholesale; the storefront catalog has no matching row yet (the storefront " +
            "syncs from wholesale on its own cadence). The canonical_sku is authoritative."
          : "Resolved against the wholesale mapping table; content_hash computed from the current " +
            "storefront universal-card representation.",
    };

    return jsonResponse({
      data: body,
      endpoint: "/api/v1/federation/identify/by-upstream",
      sources: [
        "wholesale-rds.cards",
        "wholesale-rds.card_tcgplayer_sku_ids",
        "storefront-rds.card_set_cards",
      ],
      source_license: ["cc0", "cc0", "cc0"],
      freshness: "identity",
    });
  }

  // unreachable — covered by SUPPORTED_SOURCES guard above
  return errorResponse({
    code: "INTERNAL",
    message: `source ${source} fell through dispatcher — file a bug`,
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
