/**
 * /api/v1/universal/sets/[game] — every set in a game, math-mirror form.
 *
 * Public, no-auth. The second catalog enumerator the open-substrate
 * doctrine listed as planned. Companion to /api/v1/universal/games which
 * lists the parent game collection.
 *
 * Returns sets for the named game (case-insensitive on the URL token,
 * matched against card_sets.game). Each entry carries the universal
 * preamble plus structural facts (set_code, total_cards, released_at)
 * and the typed edges back to the parent game and forward to the cards
 * within the set.
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
  { params }: { params: Promise<{ game: string }> },
) {
  try {
    const { game: gameParam } = await params;
    const gameToken = gameParam.toLowerCase();

    const r = await query(
      `SELECT
         set_code, set_name, total_cards, released_at, cover_image_url,
         created_at
       FROM card_sets
       WHERE LOWER(game) = $1
       ORDER BY released_at DESC NULLS LAST, set_code`,
      [gameToken],
    );

    if (r.rows.length === 0) {
      // Substrate-honest empty/404: say whether the whole shelf is bare
      // (restock pending) or just this game, and point at doors that
      // open today. A bare "not found" would blame the caller for the
      // platform's own empty mirror.
      const anyRows = await query(`SELECT 1 FROM card_sets LIMIT 1`);
      const catalogEmpty = anyRows.rows.length === 0;
      return NextResponse.json(
        {
          error: {
            code: "game_not_found_or_empty",
            message: catalogEmpty
              ? `No sets in the storefront catalog for game "${gameParam}" — and none for ANY game: ` +
                `the storefront mirror has not been restocked from the wholesale catalog since the ` +
                `outage window (the restock script exists and awaits its production run). ` +
                `Working doors meanwhile: https://cambridgetcg.com/api/v1/search/cards?game=op&q=OP01-001 ` +
                `resolves against the wholesale catalog directly; https://cambridgetcg.com/prices is the ` +
                `human-browsable guide. /api/v1/universal/games carries the same empty_state honestly.`
              : `No sets in the storefront catalog for game "${gameParam}". Browse ` +
                `https://cambridgetcg.com/api/v1/universal/games for the list of games with at least ` +
                `one set imported, or try https://cambridgetcg.com/api/v1/search/cards for direct ` +
                `card-number resolution against the wholesale catalog.`,
          },
        },
        { status: 404 },
      );
    }

    const retrievedAt = new Date();
    const sets = r.rows.map((row) => ({
      target_natural_token: row.set_code as string,
      target_hash: sha256(`set:${gameToken}:${row.set_code}`),
      set_name: row.set_name as string,
      total_cards: Number(row.total_cards) || 0,
      released_at: row.released_at
        ? new Date(row.released_at).toISOString().slice(0, 10)
        : null,
      cover_image_url: (row.cover_image_url as string | null) ?? null,
      first_seen_at: row.created_at
        ? {
            iso8601: new Date(row.created_at).toISOString(),
            unix_epoch_seconds: Math.floor(new Date(row.created_at).getTime() / 1000),
          }
        : null,
      _links: {
        canonical: `/api/v1/universal/set/${encodeURIComponent(row.set_code as string)}`,
      },
    }));

    const contentSeed = canonicalize({
      game: gameToken,
      count: sets.length,
      sets: sets.map((s) => ({
        target_natural_token: s.target_natural_token,
        total_cards: s.total_cards,
        released_at: s.released_at,
      })),
    });
    const contentHash = sha256(contentSeed);

    const _links = buildLinks({
      kind: "sets_collection",
      id: gameToken,
      content_hash: contentHash,
    });

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "sets_collection",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": [
        "sets[].set_name",
        "sets[].cover_image_url",
      ],
      _links,
      of_game: {
        edge_kind: "in_game",
        target_natural_token: gameToken,
        target_hash: sha256(`game:${gameToken}`),
      },
      count: sets.length,
      sets,
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
    console.error("[/api/v1/universal/sets/[game]] Error:", message);
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
