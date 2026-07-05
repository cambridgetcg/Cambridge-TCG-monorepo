/**
 * /api/v1/universal/games — every game in the catalog, math-mirror form.
 *
 * Public, no-auth. The catalog enumerator the open-substrate doctrine
 * (sister's doc) listed as planned; now stable.
 *
 * Returns a list of games derived from card_sets.game. Each entry has the
 * universal preamble fields (@encoding/@kind/@content_hash) and the
 * structural facts a participant needs to start exploring: the game's
 * natural token (the storefront's internal label, e.g. "optcg"), the
 * set_count, the card_count, the first-seen timestamp.
 */

import { NextResponse } from "next/server";
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

export async function GET() {
  try {
    const r = await query(
      `SELECT
         cs.game,
         COUNT(DISTINCT cs.set_code)        AS set_count,
         COALESCE(SUM(cs.total_cards), 0)   AS card_count,
         MIN(cs.released_at)                AS first_set_released_at,
         MAX(cs.released_at)                AS latest_set_released_at,
         MIN(cs.created_at)                 AS first_seen_at
       FROM card_sets cs
       GROUP BY cs.game
       ORDER BY cs.game`,
    );

    const retrievedAt = new Date();
    const games = r.rows.map((row) => {
      const game = row.game as string;
      return {
        target_natural_token: game,
        target_hash: sha256(`game:${game}`),
        set_count: Number(row.set_count),
        card_count: Number(row.card_count),
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
        _links: {
          canonical: `/api/v1/universal/game/${encodeURIComponent(game)}`,
          sets_collection: `/api/v1/universal/sets/${encodeURIComponent(game)}`,
        },
      };
    });

    const contentSeed = canonicalize({ kind: "games", count: games.length, games });
    const contentHash = sha256(contentSeed);

    const _links = buildLinks({
      kind: "games_collection",
      content_hash: contentHash,
    });

    const document: Record<string, unknown> = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "games_collection",
      "@content_hash": contentHash,
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      "_note_opaque": ["games[].target_natural_token"],
      _links,
      count: games.length,
      games,
      // Substrate-honest empty state. count:0 with no explanation is a
      // violation of the platform's own first doctrine — an agent led
      // here by the mirror-the-catalog guide deserves to know WHY the
      // shelf is empty and which doors are stocked meanwhile.
      ...(games.length === 0
        ? {
            empty_state: {
              why:
                "The storefront card_sets table has not been restocked from the " +
                "wholesale catalog since the platform's outage window. The wholesale " +
                "substrate itself holds the full catalog (11k+ cards); the mirror " +
                "you are reading is the empty half. The restock script exists " +
                "(apps/storefront/scripts/restock-card-sets.mjs) and awaits its " +
                "production run.",
              working_doors_meanwhile: {
                search_cards:
                  "https://cambridgetcg.com/api/v1/search/cards?game=op&q=OP01-001 — resolves against the wholesale catalog directly and works today",
                card_everything:
                  "https://cambridgetcg.com/api/v1/cards/{sku}/everything — full per-card composition, works today",
                price_guide: "https://cambridgetcg.com/prices — the human-browsable catalog",
              },
              this_will_change:
                "When the restock lands, this endpoint serves every game with no contract change. Poll at the catalog freshness budget (21600s); no faster is needed.",
            },
          }
        : {}),
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
    console.error("[/api/v1/universal/games] Error:", message);
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
