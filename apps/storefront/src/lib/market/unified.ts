// Unified market view: the collectors' order book, assembled with open
// reference data.
//
// Collectors-first (docs/decisions/2026-07-06-collectors-first.md): the
// platform holds NO position in this book. The house maker that used to
// live here — a synthetic CTCG ask from catalog stock, a standing
// trade-in-credit bid, and a demand-pressure spread engine that tightened
// both — was removed on 2026-07-06. Every row in `bids`/`asks` is now a
// collector's order; the platform facilitates, records, and publishes,
// but does not buy, sell, or quote.
//
// The catalogue price survives strictly as `reference_price`: a labelled
// publicly viewable reference (the price our synced catalogue carries), never an
// offer. UIs must render it as a reference, not as something anyone can
// click to trade against.

import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { getCardOrderBook } from "./db";
import type { CardOrderBook, OrderBookEntry, PublicTradeAggregate } from "./types";

export interface UnifiedMarketView {
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;

  // Labelled publicly viewable reference price: the number our synced catalogue
  // carries for this SKU. A different kind of fact from the collector
  // book below — it is nobody's offer, and nothing on the platform sells
  // (or buys) at it.
  reference_price: number | null;

  // Pure collector order book — no house rows on either side.
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  /** Deprecated compatibility field; empty while publication is paused. */
  trade_aggregates: PublicTradeAggregate[];
  trade_publication: CardOrderBook["trade_publication"];

  // Derived from the collector book only.
  best_bid: number | null;
  best_ask: number | null;
  market_price: number | null;
  spread: number | null;
  // % the best collector ask sits below the reference price (positive
  // values only; null when either side is missing).
  p2p_discount: number | null;
}

export async function getUnifiedMarketView(sku: string): Promise<UnifiedMarketView> {
  // Every leg below has a catch — the unified view should always render
  // something. A failure in any one source falls back to a sensible empty
  // value rather than 500'ing the whole page (the page is the user's
  // primary view; degrading is much better than failing).
  const [card, orderBook] = await Promise.all([
    fetchCard(sku).catch(() => null),
    getCardOrderBook(sku).catch((err): CardOrderBook => {
      console.error("[market/unified] getCardOrderBook failed:", err);
      return { sku, card_name: null, image_url: null, bids: [], asks: [], trade_aggregates: [], best_bid: null, best_ask: null };
    }),
  ]);

  const referencePrice = card ? retailPrice(card.price_gbp, card.channel_price) : null;

  const bids: OrderBookEntry[] = orderBook.bids;
  const asks: OrderBookEntry[] = orderBook.asks;

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  let p2pDiscount: number | null = null;
  if (referencePrice && bestAsk && bestAsk < referencePrice) {
    p2pDiscount = Math.round(((referencePrice - bestAsk) / referencePrice) * 100);
  }

  return {
    sku,
    card_name: card?.name_en || card?.name || orderBook.card_name,
    card_number: card?.card_number || null,
    set_code: card?.set_code || null,
    set_name: card?.set_name || null,
    image_url: card?.image_url || orderBook.image_url,
    rarity: card?.rarity || null,
    reference_price: referencePrice,
    bids,
    asks,
    trade_aggregates: orderBook.trade_aggregates,
    trade_publication: orderBook.trade_publication,
    best_bid: bestBid,
    best_ask: bestAsk,
    market_price: bestAsk,
    spread,
    p2p_discount: p2pDiscount,
  };
}
