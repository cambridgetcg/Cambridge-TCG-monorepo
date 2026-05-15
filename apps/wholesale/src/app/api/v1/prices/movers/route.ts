/**
 * GET /api/v1/prices/movers — 7-day biggest-mover surface.
 *
 * Single SQL CTE over price_archive (cardrush, singles, nm) joined
 * to cards, scoped by ?game=<code|slug>. Picks a "now" row (most
 * recent within last 2d) and a "then" row (most recent within 5–9d
 * ago) per card, computes pct_change, applies the ?min_price= floor
 * to the "then" price (default £10), then channel-prices each row
 * for the API key's channel. Sorted by ABS(pct_change) DESC.
 *
 * Auth: bearer-gated; channel comes from the API key.
 * License: source_license: "internal-only" — raw price_then/price_now
 * are cardrush-derived GBP and must not be re-exported to anonymous
 * surfaces. The derived pct_change and the platform's own channel_price
 * are publishable.
 *
 * Companion spec: docs/superpowers/specs/2026-05-14-movers-feature-design.md
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { games } from "@/lib/db/schema";
import { eq, or, sql } from "drizzle-orm";
import { authenticateApiKey } from "../../auth";
import { priceForChannel } from "@/lib/channel-pricing";
import {
  parseMoversParams,
  buildMoversResponse,
  type MoversRow,
} from "./helpers";

type SqlRow = {
  sku: string;
  card_number: string;
  name: string | null;
  name_en: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  image_url: string | null;
  category: string;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  price_now: string;
  price_then: string;
  now_date: string;
  then_date: string;
  pct_change: string;
};

export async function GET(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const parsed = parseMoversParams(req.nextUrl.searchParams);
    if ("error" in parsed) {
      return NextResponse.json(
        { error: parsed.error },
        { status: parsed.status },
      );
    }
    const params = parsed;

    // Resolve game (accepts both code and slug — mirrors /api/v1/prices)
    const gameRows = await db
      .select({ id: games.id, code: games.code })
      .from(games)
      .where(or(eq(games.code, params.game), eq(games.slug, params.game)))
      .limit(1);
    if (!gameRows.length) {
      return NextResponse.json(
        { error: `Game not found: ${params.game}` },
        { status: 404 },
      );
    }
    const gameId = gameRows[0].id;
    const gameCode = gameRows[0].code;

    const rows = await db.execute<SqlRow>(sql`
      WITH now_rows AS (
        SELECT DISTINCT ON (pa.card_id)
          pa.card_id, pa.price AS price_now, pa.snapshot_date AS now_date
        FROM price_archive pa
        JOIN cards c ON c.id = pa.card_id
        WHERE pa.source = 'cardrush'
          AND pa.category = ${params.category}
          AND pa.condition = 'nm'
          AND pa.snapshot_date >= CURRENT_DATE - INTERVAL '2 days'
          AND c.game_id = ${gameId}
        ORDER BY pa.card_id, pa.snapshot_date DESC
      ),
      then_rows AS (
        SELECT DISTINCT ON (pa.card_id)
          pa.card_id, pa.price AS price_then, pa.snapshot_date AS then_date
        FROM price_archive pa
        JOIN cards c ON c.id = pa.card_id
        WHERE pa.source = 'cardrush'
          AND pa.category = ${params.category}
          AND pa.condition = 'nm'
          AND pa.snapshot_date BETWEEN CURRENT_DATE - INTERVAL '9 days'
                                   AND CURRENT_DATE - INTERVAL '5 days'
          AND c.game_id = ${gameId}
        ORDER BY pa.card_id, pa.snapshot_date DESC
      )
      SELECT
        c.sku,
        c.card_number,
        c.name,
        c.name_en,
        c.set_code,
        c.set_name,
        c.rarity,
        c.image_url,
        c.category,
        c.cardrush_jpy,
        c.gbp_jpy_rate,
        n.price_now::text  AS price_now,
        n.now_date::text   AS now_date,
        t.price_then::text AS price_then,
        t.then_date::text  AS then_date,
        (((n.price_now - t.price_then) / NULLIF(t.price_then, 0)) * 100)::text AS pct_change
      FROM now_rows n
      JOIN then_rows t ON t.card_id = n.card_id
      JOIN cards c ON c.id = n.card_id
      WHERE t.price_then >= ${params.minPrice}
        AND n.price_now > 0
        AND n.price_now <> t.price_then
      ORDER BY ABS(((n.price_now - t.price_then) / NULLIF(t.price_then, 0))) DESC
      LIMIT ${params.limit}
    `);

    // Channel-price each row (mirrors /api/v1/prices/route.ts:191)
    const channel = apiKey.channel;
    const enriched: MoversRow[] = await Promise.all(
      rows.map(async (r) => {
        const priceNow = Number(r.price_now);
        const priceThen = Number(r.price_then);
        const pctChange = Number(r.pct_change);

        let channelPrice = priceNow;
        if (
          channel !== "wholesale" &&
          r.cardrush_jpy &&
          r.gbp_jpy_rate
        ) {
          const breakdown = await priceForChannel(
            r.cardrush_jpy,
            r.gbp_jpy_rate,
            channel,
            r.category,
          );
          channelPrice = breakdown.price;
        }

        return {
          sku: r.sku,
          card_number: r.card_number,
          name: r.name,
          name_en: r.name_en,
          set_code: r.set_code,
          set_name: r.set_name,
          rarity: r.rarity,
          image_url: r.image_url,
          category: r.category,
          price_now: priceNow,
          price_then: priceThen,
          channel_price: channelPrice,
          pct_change: Number(pctChange.toFixed(2)),
          now_date: r.now_date,
          then_date: r.then_date,
        };
      }),
    );

    const response = buildMoversResponse(
      enriched,
      { ...params, game: gameCode },
      channel,
      new Date(),
    );

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/prices/movers] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
