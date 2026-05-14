/**
 * GET /api/v1/tcgplayer/resolve
 *
 * Federation reverse-lookup: a partner with a TCGplayer identifier
 * (productId+subType OR a leaf skuId) resolves it back to Cambridge's
 * canonical SKU + content_hash.
 *
 * Two query shapes:
 *
 *   ?product_id=12345&sub_type=Normal
 *     → resolves via cards.tcgplayer_product_id × cards.tcgplayer_sub_type
 *
 *   ?sku_id=67890
 *     → resolves via card_tcgplayer_sku_ids.tcgplayer_sku_id, joining to the
 *       parent card AND emitting the per-condition leaf info
 *
 * Auth: Bearer-gated. The response carries only identity-resolution data
 * (canonical SKU + optional condition + language); no pricing. License
 * tier: CC0 (Cambridge's own derivation; the upstream's ID is the
 * partner's input, not redistributed).
 *
 * Used by the storefront-side public federation endpoint at
 * /api/v1/federation/identify/by-upstream.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` §1 (kingdom-080).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, cardTcgplayerSkuIds } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";

interface ResolveBody {
  source: "tcgplayer";
  /** Inputs the caller supplied (echoed for substrate-honest correlation). */
  inputs: {
    product_id: number | null;
    sub_type: string | null;
    sku_id: number | null;
  };
  /** The resolution; null when no match. */
  resolved: {
    canonical_sku: string;
    card_id: number;
    tcgplayer_product_id: number;
    tcgplayer_sub_type: string | null;
    /** Present only when input was sku_id (per-condition leaf). */
    condition: string | null;
    language: string | null;
  } | null;
  retrieved_at: string;
}

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const url = new URL(req.url);
    const productIdParam = url.searchParams.get("product_id");
    const subTypeParam = url.searchParams.get("sub_type");
    const skuIdParam = url.searchParams.get("sku_id");

    const productId = productIdParam ? parseInt(productIdParam, 10) : null;
    const skuId = skuIdParam ? parseInt(skuIdParam, 10) : null;

    if (productId === null && skuId === null) {
      return NextResponse.json(
        {
          error:
            "must supply either ?product_id=&sub_type= OR ?sku_id=",
        },
        { status: 400 },
      );
    }
    if (productId !== null && !Number.isFinite(productId)) {
      return NextResponse.json(
        { error: "product_id must be an integer" },
        { status: 400 },
      );
    }
    if (skuId !== null && !Number.isFinite(skuId)) {
      return NextResponse.json(
        { error: "sku_id must be an integer" },
        { status: 400 },
      );
    }

    const body: ResolveBody = {
      source: "tcgplayer",
      inputs: {
        product_id: productId,
        sub_type: subTypeParam,
        sku_id: skuId,
      },
      resolved: null,
      retrieved_at: new Date().toISOString(),
    };

    // ── Path A: skuId → leaf row → card ─────────────────────────────
    if (skuId !== null) {
      const leafRows = await db
        .select({
          cardId: cardTcgplayerSkuIds.cardId,
          condition: cardTcgplayerSkuIds.condition,
          language: cardTcgplayerSkuIds.language,
        })
        .from(cardTcgplayerSkuIds)
        .where(eq(cardTcgplayerSkuIds.tcgplayerSkuId, skuId))
        .limit(1);

      if (leafRows.length === 0) {
        return NextResponse.json(body, {
          headers: { "Cache-Control": "public, max-age=60" },
        });
      }

      const leaf = leafRows[0]!;
      const cardRows = await db
        .select({
          sku: cards.sku,
          tcgplayerProductId: cards.tcgplayerProductId,
          tcgplayerSubType: cards.tcgplayerSubType,
        })
        .from(cards)
        .where(eq(cards.id, leaf.cardId))
        .limit(1);

      if (cardRows.length === 0) {
        return NextResponse.json(body, {
          headers: { "Cache-Control": "public, max-age=60" },
        });
      }

      const card = cardRows[0]!;
      body.resolved = {
        canonical_sku: card.sku,
        card_id: leaf.cardId,
        tcgplayer_product_id: card.tcgplayerProductId ?? 0,
        tcgplayer_sub_type: card.tcgplayerSubType,
        condition: leaf.condition,
        language: leaf.language,
      };

      return NextResponse.json(body, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    // ── Path B: productId (+ optional subType) → card ────────────────
    if (productId !== null) {
      const conditions = [eq(cards.tcgplayerProductId, productId)];
      if (subTypeParam) {
        conditions.push(eq(cards.tcgplayerSubType, subTypeParam));
      }

      const matches = await db
        .select({
          id: cards.id,
          sku: cards.sku,
          tcgplayerProductId: cards.tcgplayerProductId,
          tcgplayerSubType: cards.tcgplayerSubType,
        })
        .from(cards)
        .where(and(...conditions))
        .limit(2);

      if (matches.length === 0) {
        return NextResponse.json(body, {
          headers: { "Cache-Control": "public, max-age=60" },
        });
      }

      // Multiple matches without sub_type — substrate-honest: surface the
      // ambiguity rather than picking arbitrarily. The caller adds &sub_type=.
      if (matches.length > 1) {
        return NextResponse.json(
          {
            ...body,
            ambiguous: true,
            message:
              `${matches.length}+ cards map to product_id=${productId}; ` +
              `supply &sub_type= (e.g. Normal, Foil, Reverse Holofoil) to disambiguate`,
          },
          { status: 409, headers: { "Cache-Control": "no-store" } },
        );
      }

      const card = matches[0]!;
      body.resolved = {
        canonical_sku: card.sku,
        card_id: card.id,
        tcgplayer_product_id: card.tcgplayerProductId ?? 0,
        tcgplayer_sub_type: card.tcgplayerSubType,
        condition: null,
        language: null,
      };

      return NextResponse.json(body, {
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    // unreachable — covered by the earlier guard
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/tcgplayer/resolve] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
