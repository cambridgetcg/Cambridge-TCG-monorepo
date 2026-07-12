/**
 * GET /api/v1/prices/games/[game]/sets/[set] — JSON sibling of
 * /prices/[game]/[set].
 *
 * Reuses loadSetState — the same composer the HTML page uses. Different
 * reading position; same substrate.
 *
 * Pagination (silent-truncation defect, 2026-07): the composer caps each
 * page at 500 rows. This route accepts ?offset/&limit (max 500), reports
 * `cards_page` (offset/limit/returned/total), and populates the envelope's
 * `next_link` when more rows exist — the payload admits it is a page
 * rather than pretending 500 rows is the whole set.
 *
 * Link segments are percent-encoded and inbound params decoded: card
 * numbers legitimately contain "/" (Vanguard DZ-BT14/018, Pokémon
 * 089/080), and an unencoded "/" in a link splits the segment and 404s
 * (slash-links defect, 2026-07).
 */

import { NextRequest, NextResponse } from "next/server";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { loadSetState } from "@/lib/prices/state";
import { decodePathParam } from "@/lib/http/params";

interface RouteContext {
  params: Promise<{ game: string; set: string }>;
}

const MAX_LIMIT = 500;

export async function GET(req: NextRequest, { params }: RouteContext): Promise<Response> {
  const { game: rawGame, set: rawSet } = await params;
  const game = decodePathParam(rawGame);
  const set = decodePathParam(rawSet);

  const url = new URL(req.url);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "", 10);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : MAX_LIMIT;

  const state = await loadSetState(game, set, { limit, offset });
  if (state === "unavailable") {
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message: `The pricing substrate is temporarily unreachable — this is an outage, not a claim that set '${set}' is absent. Retry shortly.`,
    });
  }
  if (!state) {
    return errorResponse({
      code: "NOT_FOUND",
      message: `Set '${set}' not found for game '${game}'. See /api/v1/prices/games/${encodeURIComponent(game)} for the live set list.`,
    });
  }

  const encSlug = state.config.slug; // curated slug, slash-free by construction
  const encSet = encodeURIComponent(state.set.code.toLowerCase());
  const selfBase = `/api/v1/prices/games/${encSlug}/sets/${encSet}`;
  const nextLink = state.cards_page.has_more
    ? `${selfBase}?offset=${state.cards_page.offset + state.cards_page.returned}&limit=${state.cards_page.limit}`
    : null;

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
      // Honest slice accounting: `total` counts the substrate's matching
      // rows; `returned` is this page. next_link (also in _meta) walks on.
      cards_page: {
        offset: state.cards_page.offset,
        limit: state.cards_page.limit,
        returned: state.cards_page.returned,
        total: state.cards_page.total,
        next_link: nextLink,
      },
      cards: state.cards.map((c) => ({
        sku: c.sku,
        name: c.name,
        card_number: c.card_number,
        rarity: c.rarity,
        price_gbp: c.price_gbp,
        stock: c.stock,
        path: `/prices/${encSlug}/${encSet}/${encodeURIComponent(c.card_number.toLowerCase())}`,
        api_path: `${selfBase}/cards/${encodeURIComponent(c.card_number.toLowerCase())}`,
      })),
      _links: {
        self:
          selfBase +
          (state.cards_page.offset > 0 || state.cards_page.limit !== MAX_LIMIT
            ? `?offset=${state.cards_page.offset}&limit=${state.cards_page.limit}`
            : ""),
        next: nextLink,
        html: `/prices/${encSlug}/${encSet}`,
        parent_game: `/api/v1/prices/games/${encSlug}`,
        parent_game_html: `/prices/${encSlug}`,
        methodology: "/methodology/cross-source-pricing",
      },
    },
    endpoint: "/api/v1/prices/games/[game]/sets/[set]",
    sources: state._provenance.sources,
    source_license: state._provenance.source_license,
    freshness: state._provenance.freshness,
    as_of: state._provenance.as_of ?? undefined,
    license: "CC0-1.0",
    next_link: nextLink,
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
