/**
 * /api/v1/universal/set/[code] — singleton set, math-mirror form.
 *
 * Public, no-auth. The third piece of the catalog-enumeration trinity:
 *   - /api/v1/universal/games                — every game
 *   - /api/v1/universal/sets/[game]          — every set in a game (collection)
 *   - /api/v1/universal/set/[code]           — one set (this — singleton)
 *
 * Plus its single-entity sibling endpoints for games:
 *   - /api/v1/universal/game/[token]         — one game
 *
 * Carries the full nest of _links — parent (game), siblings (the set's
 * sibling-collection in the same game), children (cards in the set, listed
 * inline since no /cards-in-set endpoint exists yet), methodology,
 * connections, manifest, openapi, federation, temporal.
 *
 * Every doorway leads everywhere related to this set.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { buildLinks } from "@/lib/universal/links";
import { decodePathParam } from "@/lib/http/params";

/** Page ceiling for the inline card list. Requests may ask for less via
 *  ?limit; never more. Pagination is honest: `cards_pagination` names the
 *  slice and `next` walks to the rest (silent-truncation defect, 2026-07). */
const MAX_CARDS_PER_PAGE = 500;

function sha256(input: string): string {
  return "sha256:" + createHash("sha256").update(input).digest("hex");
}

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`).join(",")}}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ code: string }> },
) {
  try {
    // Decode before lookup — the segment arrives percent-encoded
    // (slash-links defect, 2026-07).
    const { code: rawCode } = await params;
    const setCode = decodePathParam(rawCode);

    const offsetParam = parseInt(req.nextUrl.searchParams.get("offset") ?? "", 10);
    const limitParam = parseInt(req.nextUrl.searchParams.get("limit") ?? "", 10);
    const offset = Number.isFinite(offsetParam) && offsetParam > 0 ? offsetParam : 0;
    const limit =
      Number.isFinite(limitParam) && limitParam > 0
        ? Math.min(limitParam, MAX_CARDS_PER_PAGE)
        : MAX_CARDS_PER_PAGE;

    const setRow = await query(
      `SELECT
         cs.set_code, cs.game, cs.set_name, cs.total_cards, cs.released_at,
         cs.cover_image_url, cs.created_at,
         (SELECT COUNT(*)::int FROM card_set_cards WHERE set_code = cs.set_code)
           AS imported_card_count
       FROM card_sets cs
       WHERE cs.set_code = $1
       LIMIT 1`,
      [setCode],
    );

    if (setRow.rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "set_not_found",
            message: `No set with code "${setCode}" in the storefront catalog. Browse /api/v1/universal/games to find games, then /api/v1/universal/sets/[game] to list sets.`,
          },
        },
        { status: 404 },
      );
    }

    const set = setRow.rows[0];

    // Cards in the set (singleton-set carries its children inline; the
    // collection endpoint /sets/[game] returns set-level rows only).
    // Paged honestly: LIMIT/OFFSET + a total count, so a 1000-card set
    // arrives as declared pages instead of a silently-truncated list
    // whose next-link lies null (silent-truncation defect, 2026-07).
    const cards = await query(
      `SELECT csc.sku, csc.card_number, csc.card_name, csc.rarity, csc.variant,
              (SELECT spot_gbp FROM card_price_history
                 WHERE sku = csc.sku ORDER BY captured_on DESC LIMIT 1) AS spot_gbp
       FROM card_set_cards csc
       WHERE csc.set_code = $1
       ORDER BY csc.card_number, csc.variant
       LIMIT $2 OFFSET $3`,
      [setCode, limit, offset],
    );

    const cardsTotal = Number(set.imported_card_count) || 0;
    const hasMore = offset + cards.rows.length < cardsTotal;
    const encodedSetCode = encodeURIComponent(setCode);
    const nextPageLink = hasMore
      ? `/api/v1/universal/set/${encodedSetCode}?offset=${offset + cards.rows.length}&limit=${limit}`
      : null;

    const retrievedAt = new Date();
    const game = set.game as string;
    const gameToken = game.toLowerCase();

    const cardEntries = cards.rows.map((c) => ({
      target_natural_token: c.sku as string,
      target_hash: sha256(
        canonicalize({
          sku: c.sku,
          card_number: c.card_number,
          set_code: setCode,
          game: gameToken,
          variant: c.variant,
        }),
      ),
      card_number: c.card_number as string,
      variant: (c.variant as string) || "",
      rarity: c.rarity as string | null,
      latest_price_gbp: c.spot_gbp == null ? null : Number(c.spot_gbp),
      _links: {
        canonical: `/api/v1/universal/card/${encodeURIComponent(c.sku)}`,
      },
    }));

    const contentSeed = canonicalize({
      set_code: setCode,
      game: gameToken,
      total_cards: Number(set.total_cards) || 0,
      imported_card_count: Number(set.imported_card_count) || 0,
      released_at: set.released_at
        ? new Date(set.released_at).toISOString().slice(0, 10)
        : null,
    });
    const contentHash = sha256(contentSeed);

    const _links = buildLinks({
      kind: "set",
      id: setCode,
      parent_id: gameToken,
      content_hash: contentHash,
    });

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "set",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "set_name",
        "cover_image_url",
        "cards[].rarity",
      ],
      // `next` is null on the last page and a real URL when more cards
      // exist — never a null that lies about truncation.
      _links: { ..._links, next: nextPageLink },

      // ── Structural facts ─────────────────────────────────────────────
      set_code: setCode,
      set_name: set.set_name as string,
      total_cards_declared: Number(set.total_cards) || 0,
      imported_card_count: Number(set.imported_card_count) || 0,
      released_at: set.released_at
        ? new Date(set.released_at).toISOString().slice(0, 10)
        : null,
      cover_image_url: (set.cover_image_url as string | null) ?? null,
      first_seen_at: set.created_at
        ? {
            iso8601: new Date(set.created_at).toISOString(),
            unix_epoch_seconds: Math.floor(new Date(set.created_at).getTime() / 1000),
          }
        : null,

      // ── Graph edges ──────────────────────────────────────────────────
      of_game: {
        edge_kind: "in_game",
        target_natural_token: gameToken,
        target_hash: sha256(`game:${gameToken}`),
        _links: {
          canonical: `/api/v1/universal/game/${encodeURIComponent(gameToken)}`,
        },
      },
      sibling_collection: {
        edge_kind: "sibling_collection",
        target_natural_token: gameToken,
        _links: {
          canonical: `/api/v1/universal/sets/${encodeURIComponent(gameToken)}`,
        },
      },

      // ── Children: the cards in this set (one honest page of them) ────
      cards_pagination: {
        offset,
        limit,
        returned: cardEntries.length,
        total: cardsTotal,
        next_link: nextPageLink,
      },
      cards: cardEntries,
    };

    const selfHash = sha256(canonicalize(document));
    return NextResponse.json({ "@self_hash": selfHash, ...document }, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/universal/set/[code]] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
