import { NextResponse } from "next/server";
import {
  fetchPrices,
  fetchGamesDetailed,
  fetchSetsDetailed,
  type WholesaleSource,
} from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { query } from "@/lib/db";
import { getEnCardImages, type EnCardImage } from "@/lib/cards/en-card-data";

// GET /api/market/catalog — all cards with spot + P2P data for Cardmarket-style browse
//
// Source provenance: every response carries a `source` field and an
// `x-catalog-source` header — 'wholesale-api' (live HTTP), 'wholesale-db'
// (direct read of the wholesale Postgres; the API is retired), or a 503
// when both substrates failed. The UI keys its <Provenance> label off
// this; a database read must never pass itself off as a live API, and an
// outage must never render as an empty catalog.

function sourceHeaders(source: WholesaleSource) {
  return { "x-catalog-source": source };
}

function catalogUnavailable() {
  return NextResponse.json(
    {
      error: {
        code: "catalog_unavailable",
        message:
          "The card catalog can't be loaded right now: the wholesale API is unreachable and the direct database read also failed. This is a source outage, not an empty catalog — please try again shortly.",
      },
      source: "unavailable" as const,
    },
    { status: 503, headers: sourceHeaders("unavailable") },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || "one-piece";
  const set = url.searchParams.get("set") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const sort = url.searchParams.get("sort") || "name_asc";
  const limit = parseInt(url.searchParams.get("limit") || "48", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const view = url.searchParams.get("view"); // "sets" = list sets, "games" = list games

  // List games
  if (view === "games") {
    const { games, source } = await fetchGamesDetailed();
    if (source === "unavailable") return catalogUnavailable();
    return NextResponse.json({ games, source }, { headers: sourceHeaders(source) });
  }

  // List sets for a game
  if (view === "sets") {
    const { sets, source } = await fetchSetsDetailed(game);
    if (source === "unavailable") return catalogUnavailable();
    return NextResponse.json({ sets, game, source }, { headers: sourceHeaders(source) });
  }

  // Fetch cards from wholesale catalog
  const sortMap: Record<string, string> = {
    name_asc: "name_asc",
    name_desc: "name_desc",
    number_asc: "number_asc",
  };

  const data = await fetchPrices({
    game,
    set,
    q: search,
    sort: sortMap[sort] || "name_asc",
    limit,
    offset,
  });

  // fetchPrices always stamps a source; if the invariant ever breaks we
  // fail loud (503) rather than fabricate a "live" label.
  const source: WholesaleSource = data.source ?? "unavailable";
  if (source === "unavailable") return catalogUnavailable();

  // Enrich with P2P market data (best bid/ask for each SKU)
  const skus = data.items.map(i => i.sku);
  let p2pData = new Map<string, { best_bid: string | null; best_ask: string | null; bid_count: number; ask_count: number }>();

  if (skus.length > 0) {
    try {
      const p2pResult = await query(
        `SELECT sku,
           MAX(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN price END) as best_bid,
           MIN(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN price END) as best_ask,
           SUM(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as bid_count,
           SUM(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as ask_count
         FROM market_orders WHERE sku = ANY($1)
         GROUP BY sku`,
        [skus]
      );
      for (const row of p2pResult.rows) {
        p2pData.set(row.sku, {
          best_bid: row.best_bid,
          best_ask: row.best_ask,
          bid_count: parseInt(row.bid_count || "0", 10),
          ask_count: parseInt(row.ask_count || "0", 10),
        });
      }
    } catch {
      // P2P data enrichment is optional
    }
  }

  // Official English self-hosted card images (one batch query, per the
  // grid contract). The publication rule lives entirely in en-card-data.ts:
  // only publisher 'official_sample' art, self-hosted via s3_key (the stored
  // source_url is NEVER served — no hotlink), takedown-clear, and always
  // carrying its copyright line. The returned `url` is already the Cambridge-
  // hosted URL; cards with no published official image simply aren't in the
  // map, so their image_url stays whatever db-source gave (today: null).
  let enImages = new Map<string, EnCardImage>();
  if (skus.length > 0) {
    try {
      enImages = await getEnCardImages(skus);
    } catch {
      // EN image enrichment is optional; the catalog renders without it.
    }
  }

  // Collectors-first (2026-07-06): the tradein-credit channel enrichment
  // (the house's standing we-buy bids) is gone — one less price channel
  // to compute. Every bid/ask below is a collector's; spot_price survives
  // as a labelled, policy-bound reference, never as an offer or reuse grant.
  const cards = data.items.map(item => {
    const spot = retailPrice(item.price_gbp, item.channel_price);
    const p2p = p2pData.get(item.sku);
    const bestAsk = p2p?.best_ask ? parseFloat(p2p.best_ask) : null;
    const marketPrice = bestAsk !== null && (spot === null || bestAsk < spot) ? bestAsk : spot;
    // db-source image_url is always null; the official self-hosted EN image
    // (already the Cambridge URL — never source_url) overrides it when one
    // is published, and its copyright line rides along for co-located render.
    const img = enImages.get(item.sku);

    return {
      sku: item.sku,
      card_number: item.card_number,
      name: item.name_en || item.name || item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      rarity: item.rarity,
      image_url: img?.url ?? item.image_url,
      image_attribution: img?.attribution ?? null,
      // Prices — spot_price is the catalogue reference (labelled "(ref)"
      // in the UI), not something anyone sells at.
      spot_price: spot,
      market_price: marketPrice,
      stock: item.stock,
      // Pure collector book
      best_bid: p2p?.best_bid ? parseFloat(p2p.best_bid) : null,
      best_ask: bestAsk,
      p2p_sellers: p2p?.ask_count || 0,
      p2p_buyers: p2p?.bid_count || 0,
      has_p2p: (p2p?.bid_count || 0) > 0 || (p2p?.ask_count || 0) > 0,
    };
  });

  return NextResponse.json(
    {
      cards,
      total: data.total,
      game,
      set: set || null,
      source,
    },
    { headers: sourceHeaders(source) },
  );
}
