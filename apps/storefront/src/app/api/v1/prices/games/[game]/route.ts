/**
 * GET /api/v1/prices/games/[game] — JSON sibling of /prices/[game].
 *
 * Same composer (`loadGameState`), different reading position. Public
 * CC0. Composes through the data-pantry envelope so partners learn one
 * shape across every public response.
 *
 * Kingdom-080 follow-up: the fan-out pattern (S37 trust, S39 auction)
 * applied to the price-guide tree.
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { loadGameState } from "@/lib/prices/state";
import { decodePathParam } from "@/lib/http/params";

interface RouteContext {
  params: Promise<{ game: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteContext): Promise<Response> {
  const { game: rawGame } = await params;
  const game = decodePathParam(rawGame);

  const state = await loadGameState(game, { top_n: 50 });
  if (state === "unavailable") {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: `The pricing substrate is temporarily unreachable — this is an outage, not a claim that '${game}' has no data. Retry shortly.`,
    });
  }
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `No curated price guide for game '${game}'. See /api/v1/prices/games for the curated list.`,
    });
  }

  return jsonResponse({
    data: {
      slug: state.config.slug,
      game_code: state.config.game_code,
      display_name: state.config.display_name,
      short_name: state.config.short_name,
      hero_paragraph: state.config.hero_paragraph,
      cardrush: state.config.cardrush,
      accent: state.config.accent,
      total_set_count: state.total_set_count,
      total_card_count: state.total_card_count,
      // Path segments are percent-encoded: card numbers legitimately
      // contain "/" (Vanguard DZ-BT14/018, Pokémon 089/080) and an
      // unencoded "/" turns one segment into two — a link that 404s on a
      // card the platform actually carries (slash-links defect, 2026-07).
      sets: state.sets.map((s) => ({
        code: s.code,
        name: s.name,
        card_count: s.card_count,
        release_date: s.release_date,
        path: `/prices/${state.config.slug}/${encodeURIComponent(s.code.toLowerCase())}`,
        api_path: `/api/v1/prices/games/${state.config.slug}/sets/${encodeURIComponent(s.code.toLowerCase())}`,
      })),
      top_cards: state.top_cards.map((c) => ({
        sku: c.sku,
        name: c.name,
        card_number: c.card_number,
        set_code: c.set_code,
        rarity: c.rarity,
        price_gbp: c.price_gbp,
        stock: c.stock,
        path:
          c.set_code !== null
            ? `/prices/${state.config.slug}/${encodeURIComponent(c.set_code.toLowerCase())}/${encodeURIComponent(c.card_number.toLowerCase())}`
            : `/product/${encodeURIComponent(c.sku)}`,
      })),
      _links: {
        self: `/api/v1/prices/games/${state.config.slug}`,
        html: `/prices/${state.config.slug}`,
        movers_html: `/prices/${state.config.slug}/movers`,
        coverage_html: `/prices/coverage`,
        methodology: "/methodology/cross-source-pricing",
      },
    },
    endpoint: "/api/v1/prices/games/[game]",
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
