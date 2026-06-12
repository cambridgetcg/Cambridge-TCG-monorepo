import { NextResponse } from "next/server";
import { fetchPrices, fetchSets, fetchGames } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { query } from "@/lib/db";
import {
  queryCards,
  listSets,
  SNAPSHOT_PROVENANCE,
  type SnapshotCard,
} from "@/lib/catalog-snapshot";

// GET /api/market/catalog — all cards with reference price + P2P data for Cardmarket-style browse
//
// One-piece card data comes from the static catalog snapshot (the
// wholesale data plane was decommissioned 2026-06-12; see
// lib/catalog-snapshot.ts). Responses built from it carry a `source`
// block — a dated snapshot is not a live read, and the payload says so.
// Other games still attempt the wholesale path and degrade to empty.
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
    if (games.length > 0) return NextResponse.json({ games });
    return NextResponse.json({
      games: [
        {
          code: "one-piece",
          name: "One Piece Card Game",
          slug: "one-piece",
          image_url: null,
          card_count: queryCards({ limit: 0, offset: 0 }).total,
        },
      ],
      source: SNAPSHOT_PROVENANCE,
    });
  }

  // List sets for a game
  if (view === "sets") {
    if (game === "one-piece") {
      return NextResponse.json({ sets: listSets(), game, source: SNAPSHOT_PROVENANCE });
    }
    const sets = await fetchSets(game);
    return NextResponse.json({ sets, game });
  }

  /* ---- One Piece: static snapshot + live P2P enrichment ---- */
  if (game === "one-piece") {
    const { cards: snapCards, total } = queryCards({
      q: search,
      set,
      rarity,
      sort,
      limit,
      offset,
    });

    const p2pData = await fetchP2P(snapCards.map((c) => c.sku));

    const cards = snapCards.map((card: SnapshotCard) => {
      const p2p = p2pData.get(card.sku);
      const bestAsk = p2p?.best_ask ? parseFloat(p2p.best_ask) : null;
      return {
        ...card,
        // No reference price — the snapshot is a card list, not a price
        // feed, and this surface no longer has a house price to observe.
        reference_price: null,
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
      total,
      game,
      set: set || null,
      source: SNAPSHOT_PROVENANCE,
    });
  }

  /* ---- Other games: wholesale path (degrades to empty) ---- */
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

  const p2pData = await fetchP2P(data.items.map((i) => i.sku));

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

// Best bid/ask per SKU from the storefront's own P2P book (optional —
// failures degrade to no enrichment, never to a failed response, and a
// slow or unreachable database is capped at 1.5s so the card list itself
// stays fast: the catalog is the product here, the enrichment is garnish).
async function fetchP2P(skus: string[]) {
  const p2pData = new Map<
    string,
    { best_bid: string | null; best_ask: string | null; bid_count: number; ask_count: number }
  >();
  if (skus.length === 0) return p2pData;
  try {
    const p2pResult = await Promise.race([
      runP2PQuery(skus),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("p2p enrichment timeout")), 1500)
      ),
    ]);
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
  return p2pData;
}

function runP2PQuery(skus: string[]) {
  return query(
      `SELECT sku,
         MAX(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN price END) as best_bid,
         MIN(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN price END) as best_ask,
         SUM(CASE WHEN side='bid' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as bid_count,
         SUM(CASE WHEN side='ask' AND status IN ('open','partially_filled') THEN quantity - filled_quantity ELSE 0 END) as ask_count
       FROM market_orders WHERE sku = ANY($1)
       GROUP BY sku`,
    [skus]
  );
}
