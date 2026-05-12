/**
 * /api/v1/universal/game/[token] — singleton game, math-mirror form.
 *
 * Public, no-auth. The single-game endpoint that completes the catalog
 * trinity (games / game / sets / set / card). Carries the full nest of
 * _links — sibling-collection (games), children (sets), methodology,
 * connections, manifest, openapi, federation. The doorway from any
 * card up through its set up through its game and back down through
 * the game's other sets to other cards.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { query } from "@/lib/db";
import { buildLinks } from "@/lib/universal/links";

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
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    const gameToken = rawToken.toLowerCase();

    const r = await query(
      `SELECT
         cs.game,
         COUNT(DISTINCT cs.set_code)              AS set_count,
         COALESCE(SUM(cs.total_cards), 0)         AS declared_card_count,
         (SELECT COUNT(*)::int FROM card_set_cards csc
            JOIN card_sets cs2 ON cs2.set_code = csc.set_code
           WHERE LOWER(cs2.game) = $1)            AS imported_card_count,
         MIN(cs.released_at)                      AS first_set_released_at,
         MAX(cs.released_at)                      AS latest_set_released_at,
         MIN(cs.created_at)                       AS first_seen_at,
         MAX(cs.updated_at)                       AS last_updated_at
       FROM card_sets cs
       WHERE LOWER(cs.game) = $1
       GROUP BY cs.game
       LIMIT 1`,
      [gameToken],
    );

    if (r.rows.length === 0) {
      return NextResponse.json(
        {
          error: {
            code: "game_not_found",
            message: `No game "${rawToken}" in the storefront catalog. Browse /api/v1/universal/games for the list.`,
          },
        },
        { status: 404 },
      );
    }

    const row = r.rows[0];
    const retrievedAt = new Date();

    // Recent sets — surface the three most-recent for the singleton view.
    const recentSets = await query(
      `SELECT set_code, set_name, total_cards, released_at
         FROM card_sets
        WHERE LOWER(game) = $1
        ORDER BY released_at DESC NULLS LAST, set_code
        LIMIT 5`,
      [gameToken],
    );

    const contentSeed = canonicalize({
      game: gameToken,
      set_count: Number(row.set_count),
      declared_card_count: Number(row.declared_card_count),
      imported_card_count: Number(row.imported_card_count),
    });
    const contentHash = sha256(contentSeed);

    const _links = buildLinks({
      kind: "game",
      id: gameToken,
      content_hash: contentHash,
    });

    const setEntries = recentSets.rows.map((s) => ({
      target_natural_token: s.set_code as string,
      target_hash: sha256(`set:${gameToken}:${s.set_code}`),
      set_name: s.set_name as string,
      total_cards: Number(s.total_cards) || 0,
      released_at: s.released_at
        ? new Date(s.released_at).toISOString().slice(0, 10)
        : null,
      _links: {
        canonical: `/api/v1/universal/set/${encodeURIComponent(s.set_code)}`,
      },
    }));

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "game",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "target_natural_token",
        "recent_sets[].set_name",
      ],
      _links,

      // ── Structural facts ─────────────────────────────────────────────
      target_natural_token: gameToken,
      target_hash: sha256(`game:${gameToken}`),
      set_count: Number(row.set_count),
      declared_card_count: Number(row.declared_card_count),
      imported_card_count: Number(row.imported_card_count),
      first_set_released_at: row.first_set_released_at
        ? new Date(row.first_set_released_at).toISOString().slice(0, 10)
        : null,
      latest_set_released_at: row.latest_set_released_at
        ? new Date(row.latest_set_released_at).toISOString().slice(0, 10)
        : null,
      first_seen_at: row.first_seen_at
        ? {
            iso8601: new Date(row.first_seen_at).toISOString(),
            unix_epoch_seconds: Math.floor(new Date(row.first_seen_at).getTime() / 1000),
          }
        : null,
      last_updated_at: row.last_updated_at
        ? {
            iso8601: new Date(row.last_updated_at).toISOString(),
            unix_epoch_seconds: Math.floor(new Date(row.last_updated_at).getTime() / 1000),
          }
        : null,

      // ── Graph edges ──────────────────────────────────────────────────
      sibling_collection: {
        edge_kind: "sibling_collection",
        _links: { canonical: "/api/v1/universal/games" },
      },
      sets_collection: {
        edge_kind: "children_collection",
        _links: { canonical: `/api/v1/universal/sets/${encodeURIComponent(gameToken)}` },
      },

      // ── Children sample ──────────────────────────────────────────────
      recent_sets: setEntries,
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
    console.error("[/api/v1/universal/game/[token]] Error:", message);
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
