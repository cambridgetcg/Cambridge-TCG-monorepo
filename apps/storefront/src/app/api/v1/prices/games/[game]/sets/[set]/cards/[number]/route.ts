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
import { decodePathParam } from "@/lib/http/params";

interface RouteContext {
  params: Promise<{ game: string; set: string; number: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  // Decode before lookup: card numbers legitimately contain "/"
  // (Vanguard DZ-BT14/018, Pokémon 089/080) and arrive percent-encoded —
  // matching the raw segment against the catalog would 404 a card the
  // platform actually carries (slash-links defect, 2026-07).
  const { game: rawGame, set: rawSet, number: rawNumber } = await params;
  const game = decodePathParam(rawGame);
  const set = decodePathParam(rawSet);
  const number = decodePathParam(rawNumber);

  const state = await loadCardState(game, set, number);
  if (state === "unavailable") {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: `The pricing substrate is temporarily unreachable — this is an outage, not a claim that card '${number}' is absent. Retry shortly.`,
    });
  }
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
      // Every path segment percent-encoded — card numbers and the SKUs
      // derived from them may contain "/" (slash-links defect, 2026-07).
      _links: (() => {
        const encSet = encodeURIComponent(state.set.code.toLowerCase());
        const encNumber = encodeURIComponent(state.card.card_number.toLowerCase());
        const encSku = encodeURIComponent(state.card.sku);
        return {
          self: `/api/v1/prices/games/${state.config.slug}/sets/${encSet}/cards/${encNumber}`,
          html: `/prices/${state.config.slug}/${encSet}/${encNumber}`,
          math_mirror: `/api/v1/universal/card/${encSku}`,
          history: `/api/v1/cards/${encSku}/history`,
          product: `/product/${encSku}`,
          market: `/market/${encSku}`,
          market_mirror: `/cards/${encSku}/market`,
          parent_set: `/api/v1/prices/games/${state.config.slug}/sets/${encSet}`,
          parent_set_html: `/prices/${state.config.slug}/${encSet}`,
          parent_game: `/api/v1/prices/games/${state.config.slug}`,
          methodology_cross_source: "/methodology/cross-source-pricing",
          methodology_upstream_sources: "/methodology/upstream-sources",
        };
      })(),
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
