import { NextResponse } from "next/server";
import { fetchPrices, fetchSets, fetchGames } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { query } from "@/lib/db";

// GET /api/market/catalog — all cards with reference price + P2P data for Cardmarket-style browse
export async function GET(request: Request) {
  const url = new URL(request.url);
  const game = url.searchParams.get("game") || "one-piece";
  const set = url.searchParams.get("set") || undefined;
  const search = url.searchParams.get("q") || undefined;
  const rarity = url.searchParams.get("rarity") || undefined;
  const sort = url.searchParams.get("sort") || "name_asc";
  const limit = parseInt(url.searchParams.get("limit") || "48", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const view = url.searchParams.get("view"); // "sets" = list sets, "games" = list games

  // List games
  if (view === "games") {
    const games = await fetchGames();
    return NextResponse.json({ games });
  }

  // List sets for a game
  if (view === "sets") {
    const sets = await fetchSets(game);
    return NextResponse.json({ sets, game });
  }

  // Fetch cards from wholesale catalog
  const sortMap: Record<string, string> = {
    name_asc: "name_asc",
    name_desc: "name_desc",
    price_asc: "price_asc",
    price_desc: "price_desc",
    number_asc: "number_asc",
  };

  const data = await fetchPrices({
    game,
    set,
    q: search,
    rarity,
    sort: sortMap[sort] || "name_asc",
    limit,
    offset,
  });

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

  const cards = data.items.map(item => {
    const reference = retailPrice(item.price_gbp, item.channel_price);
    const p2p = p2pData.get(item.sku);
    const bestAsk = p2p?.best_ask ? parseFloat(p2p.best_ask) : null;

    return {
      sku: item.sku,
      card_number: item.card_number,
      name: item.name_en || item.name || item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      rarity: item.rarity,
      image_url: item.image_url,
      // Reference price — a catalog observation, not an offer.
      reference_price: reference,
      // Market price is the pure P2P best ask (null when no asks).
      market_price: bestAsk,
      best_bid: p2p?.best_bid ? parseFloat(p2p.best_bid) : null,
      best_ask: bestAsk,
      p2p_sellers: p2p?.ask_count || 0,
      p2p_buyers: p2p?.bid_count || 0,
      has_p2p: (p2p?.bid_count || 0) > 0 || (p2p?.ask_count || 0) > 0,
    };
  });

  return NextResponse.json({
    cards,
    total: data.total,
    game,
    set: set || null,
  });
}
