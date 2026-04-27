import { NextResponse } from "next/server";
import { fetchPrices, fetchSets, fetchGames } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { query } from "@/lib/db";

// GET /api/market/catalog — all cards with spot + P2P data for Cardmarket-style browse
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

  // Fetch trade-in credit prices (CTCG standing bids)
  // Must paginate — API caps at 500 per request
  const tradeinMap = new Map<string, number>();
  {
    let tradeinOffset = 0;
    let tradeinTotal = Infinity;
    while (tradeinOffset < tradeinTotal) {
      const tradeinPage = await fetchPrices({
        game, set, limit: 500, offset: tradeinOffset, channel: "tradein-credit",
      }).catch(() => ({ items: [], total: 0 }));
      for (const item of tradeinPage.items) {
        if (item.channel_price && item.channel_price > 0) {
          tradeinMap.set(item.sku, item.channel_price);
        }
      }
      tradeinTotal = tradeinPage.total;
      tradeinOffset += 500;
      if (tradeinPage.items.length < 500) break;
    }
  }

  const cards = data.items.map(item => {
    const spot = retailPrice(item.price_gbp, item.channel_price);
    const p2p = p2pData.get(item.sku);
    const bestAsk = p2p?.best_ask ? parseFloat(p2p.best_ask) : null;
    const marketPrice = bestAsk && bestAsk < spot ? bestAsk : spot;
    const tradeinCredit = tradeinMap.get(item.sku) || null;

    return {
      sku: item.sku,
      card_number: item.card_number,
      name: item.name_en || item.name || item.card_number,
      set_code: item.set_code,
      set_name: item.set_name,
      rarity: item.rarity,
      image_url: item.image_url,
      // Prices
      spot_price: spot,
      market_price: marketPrice,
      stock: item.stock,
      // CTCG trade-in bid (store credit — always willing to buy)
      tradein_credit: tradeinCredit,
      // Bids (P2P + CTCG credit bid)
      best_bid: (() => {
        const p2pBid = p2p?.best_bid ? parseFloat(p2p.best_bid) : null;
        if (p2pBid && tradeinCredit) return Math.max(p2pBid, tradeinCredit);
        return p2pBid || tradeinCredit;
      })(),
      best_ask: bestAsk,
      p2p_sellers: p2p?.ask_count || 0,
      p2p_buyers: (p2p?.bid_count || 0) + (tradeinCredit ? 1 : 0), // +1 for CTCG
      has_p2p: (p2p?.bid_count || 0) > 0 || (p2p?.ask_count || 0) > 0 || !!tradeinCredit,
    };
  });

  return NextResponse.json({
    cards,
    total: data.total,
    game,
    set: set || null,
  });
}
