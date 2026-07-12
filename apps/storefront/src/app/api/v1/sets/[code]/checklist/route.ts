/**
 * GET /api/v1/sets/[code]/checklist — public set checklist.
 *
 * The collector-facing complement to /account/sets/[code] (which is the
 * same grid intersected with a signed-in user's portfolio). This surface
 * carries NO user data: it is the full card list of one set straight from
 * the storefront catalog mirror (card_set_cards + card_sets), so a
 * collector — or an agent building a binder app — can print the checklist
 * without an account.
 *
 * Shape:
 *   data.set    — set_code, set_name, game, total_cards_declared (the
 *                 card_sets.total_cards column) vs total_cards_actual
 *                 (live COUNT over card_set_cards; substrate-honest when
 *                 the two disagree), released_at, cover_image_url
 *   data.cards  — [{ card_number, variant, sku, card_name, rarity,
 *                    image_url, _links }]
 *   pagination  — ?offset / ?limit (max 500) + next_link + total, so a
 *                 1000-card set is walkable and the payload admits when
 *                 it is a page rather than the whole.
 *
 * Card numbers may contain "/" (Vanguard DZ-BT14/018, Pokémon 089/080);
 * every emitted link percent-encodes its path segments and the incoming
 * [code] segment is decoded before lookup. Set codes themselves contain
 * no slashes — a decoded code containing "/" is rejected as invalid
 * rather than silently probing the catalog.
 *
 * Data-pantry envelope, CC0, registered in manifest.ts.
 */

import { NextRequest } from "next/server";
import { query } from "@/lib/db";
import { jsonResponse, errorResponse } from "@/lib/data-pantry";
import { decodePathParam } from "@/lib/http/params";

const ENDPOINT = "/api/v1/sets/[code]/checklist";
const MAX_LIMIT = 500;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code: rawCode } = await params;
  const setCode = decodePathParam(rawCode).trim();

  // Set codes are slash-free identifiers (OP01, SV8A, DZ-BT14…). A "/"
  // in the decoded value means the caller encoded a path, not a set code.
  if (!setCode || setCode.includes("/") || setCode.length > 40) {
    return errorResponse({
      code: "INVALID_INPUT",
      message:
        `'${setCode || rawCode}' is not a valid set code. Set codes are short ` +
        `slash-free identifiers like 'OP01' or 'SV8A'. Browse ` +
        `/api/v1/universal/games then /api/v1/universal/sets/[game] for the catalog.`,
      endpoint: ENDPOINT,
    });
  }

  const url = new URL(req.url);
  const offsetParam = parseInt(url.searchParams.get("offset") ?? "", 10);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
  const limit =
    Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : MAX_LIMIT;

  try {
    const setRow = await query(
      `SELECT cs.set_code, cs.game, cs.set_name, cs.total_cards,
              cs.released_at, cs.cover_image_url,
              (SELECT COUNT(*)::int FROM card_set_cards WHERE set_code = cs.set_code)
                AS actual_card_count
       FROM card_sets cs
       WHERE cs.set_code = $1
       LIMIT 1`,
      [setCode],
    );

    if (setRow.rows.length === 0) {
      return errorResponse({
        code: "NOT_FOUND",
        message:
          `No set with code '${setCode}' in the storefront catalog. Sets are ` +
          `mirrored from the wholesale catalog; browse /api/v1/universal/games → ` +
          `/api/v1/universal/sets/[game] for what is on the shelf today.`,
        endpoint: ENDPOINT,
      });
    }

    const set = setRow.rows[0];
    const total = Number(set.actual_card_count) || 0;

    const cards = await query(
      `SELECT card_number, variant, sku, card_name, rarity, image_url
       FROM card_set_cards
       WHERE set_code = $1
       ORDER BY card_number ASC, variant ASC
       LIMIT $2 OFFSET $3`,
      [setCode, limit, offset],
    );

    const hasMore = offset + cards.rows.length < total;
    const nextLink = hasMore
      ? `/api/v1/sets/${encodeURIComponent(setCode)}/checklist?offset=${offset + cards.rows.length}&limit=${limit}`
      : null;

    return jsonResponse({
      data: {
        set: {
          set_code: set.set_code as string,
          game: set.game as string,
          set_name: set.set_name as string,
          // Two counts, named apart on purpose (substrate honesty): the
          // declared total is the card_sets column; the actual total is a
          // live COUNT over card_set_cards. When they disagree, the mirror
          // is mid-import or the declared figure is stale — the payload
          // says so instead of picking one silently.
          total_cards_declared: Number(set.total_cards) || 0,
          total_cards_actual: total,
          released_at: set.released_at
            ? new Date(set.released_at).toISOString().slice(0, 10)
            : null,
          cover_image_url: (set.cover_image_url as string | null) ?? null,
        },
        cards: cards.rows.map((c) => ({
          card_number: c.card_number as string,
          variant: (c.variant as string) || "",
          sku: c.sku as string,
          card_name: (c.card_name as string | null) ?? null,
          rarity: (c.rarity as string | null) ?? null,
          image_url: (c.image_url as string | null) ?? null,
          _links: {
            // Card numbers / SKUs may carry "/" — encode every segment.
            card: `/api/v1/universal/card/${encodeURIComponent(c.sku as string)}`,
            history: `/api/v1/cards/${encodeURIComponent(c.sku as string)}/history`,
            market_html: `/market/${encodeURIComponent(c.sku as string)}`,
          },
        })),
        pagination: {
          offset,
          limit,
          returned: cards.rows.length,
          total,
          next_link: nextLink,
        },
        _links: {
          self:
            `/api/v1/sets/${encodeURIComponent(setCode)}/checklist` +
            (offset > 0 || limit !== MAX_LIMIT ? `?offset=${offset}&limit=${limit}` : ""),
          set_math_mirror: `/api/v1/universal/set/${encodeURIComponent(setCode)}`,
          game: `/api/v1/universal/game/${encodeURIComponent(String(set.game).toLowerCase())}`,
        },
      },
      endpoint: ENDPOINT,
      sources: ["storefront-rds.card_sets", "storefront-rds.card_set_cards"],
      source_license: ["cc0", "cc0"],
      freshness: "catalog",
      license: "CC0-1.0",
      next_link: nextLink,
      does_not_include: [
        "ownership/portfolio state — the signed-in checklist lives at /api/account/sets/[code]",
        "prices — the reference-price history per card is at /api/v1/cards/[sku]/history",
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/sets/[code]/checklist] Error:", message);
    return errorResponse({
      code: "SOURCE_UNAVAILABLE",
      message:
        "The catalog substrate is temporarily unreachable — this is an outage, " +
        `not a claim that set '${setCode}' is absent. Retry shortly.`,
      endpoint: ENDPOINT,
    });
  }
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
