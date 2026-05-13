/**
 * GET /api/v1/prices/games/[game]/sets/[set] — JSON sibling of
 * /prices/[game]/[set].
 *
 * Reuses loadSetState — the same composer the HTML page uses. Different
 * reading position; same substrate.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { loadSetState } from "@/lib/prices/state";

interface RouteContext {
  params: Promise<{ game: string; set: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const { game, set } = await params;

  const state = await loadSetState(game, set);
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Set '${set}' not found for game '${game}'. See /api/v1/prices/games/${game} for the live set list.`,
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
        card_count: state.set.card_count,
        release_date: state.set.release_date,
      },
      total_in_set: state.total_in_set,
      cards: state.cards.map((c) => ({
        sku: c.sku,
        name: c.name,
        card_number: c.card_number,
        rarity: c.rarity,
        price_gbp: c.price_gbp,
        tradein_credit_gbp: c.tradein_credit_gbp,
        stock: c.stock,
        path: `/prices/${state.config.slug}/${state.set.code.toLowerCase()}/${c.card_number.toLowerCase()}`,
        api_path: `/api/v1/prices/games/${state.config.slug}/sets/${state.set.code.toLowerCase()}/cards/${c.card_number.toLowerCase()}`,
      })),
      _links: {
        self: `/api/v1/prices/games/${state.config.slug}/sets/${state.set.code.toLowerCase()}`,
        html: `/prices/${state.config.slug}/${state.set.code.toLowerCase()}`,
        parent_game: `/api/v1/prices/games/${state.config.slug}`,
        parent_game_html: `/prices/${state.config.slug}`,
        methodology: "/methodology/cross-source-pricing",
      },
    },
    endpoint: "/api/v1/prices/games/[game]/sets/[set]",
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
