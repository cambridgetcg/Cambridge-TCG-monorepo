/**
 * GET /api/v1/prices/games/[game]/sets/[set]/cards/[number] —
 * JSON sibling of /prices/[game]/[set]/[number].
 *
 * The third reading position for the per-card surface. The HTML page
 * renders the data; this endpoint emits it. The math-mirror sibling at
 * /api/v1/universal/card/[sku] gives the third reading (cryptographic
 * hashes + ratios + content_hash) — three readings, one substrate.
 *
 * Cross-source signals (CardRush / TCGplayer) ride in the response with
 * arrival state + license tier; auth-gated history paths are surfaced
 * so a signed-in agent can follow through.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { loadCardState } from "@/lib/prices/state";

interface RouteContext {
  params: Promise<{ game: string; set: string; number: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const { game, set, number } = await params;

  const state = await loadCardState(game, set, number);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Card '${number}' not found in set '${set}' for game '${game}'. See /api/v1/prices/games/${game}/sets/${set} for the live card list.`,
    });
  }

  return jsonResponse({
    data: {
      game: {
        slug: state.config.slug,
        game_code: state.config.game_code,
        display_name: state.config.display_name,
      },
      set: {
        code: state.set.code,
        name: state.set.name,
        release_date: state.set.release_date,
      },
      card: {
        sku: state.card.sku,
        name: state.card.name,
        card_number: state.card.card_number,
        rarity: state.card.rarity,
        image_url: state.card.image_url,
        price_gbp: state.card.price_gbp,
        stock: state.card.stock,
        updated_at: state.card.updated_at,
      },
      cross_source_signals: state.cross_source_signals,
      _links: {
        self: `/api/v1/prices/games/${state.config.slug}/sets/${state.set.code.toLowerCase()}/cards/${state.card.card_number.toLowerCase()}`,
        html: `/prices/${state.config.slug}/${state.set.code.toLowerCase()}/${state.card.card_number.toLowerCase()}`,
        math_mirror: `/api/v1/universal/card/${state.card.sku}`,
        market: `/market/${state.card.sku}`,
        market_mirror: `/cards/${state.card.sku}/market`,
        parent_set: `/api/v1/prices/games/${state.config.slug}/sets/${state.set.code.toLowerCase()}`,
        parent_set_html: `/prices/${state.config.slug}/${state.set.code.toLowerCase()}`,
        parent_game: `/api/v1/prices/games/${state.config.slug}`,
        methodology_cross_source: "/methodology/cross-source-pricing",
        methodology_upstream_sources: "/methodology/upstream-sources",
      },
    },
    endpoint: "/api/v1/prices/games/[game]/sets/[set]/cards/[number]",
    sources: state._provenance.sources,
    source_license: state._provenance.source_license,
    freshness: state._provenance.freshness,
    as_of: state._provenance.as_of ?? undefined,
    license: "CC0-1.0",
  });
}

export async function OPTIONS(): Promise<Response> {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
