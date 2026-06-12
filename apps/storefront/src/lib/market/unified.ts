// Unified market view: the pure P2P order book
//
// The platform injects nothing and quotes nothing (regulator pivot,
// kingdom-101). Both sides of the book are other people's orders;
// best_bid / best_ask / market_price / spread derive from the P2P book
// alone. reference_price is a catalog read kept as a price-guide hint —
// it is an observation, not an offer.
//
// See docs/methodology/regulator.md: the platform that runs the market
// does not trade in it.

import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { getTrustTier } from "@/lib/escrow/trust-engine";
import { getCardOrderBook } from "./db";
import { query } from "@/lib/db";
import type { CardOrderBook, MarketTrade, OrderBookEntry } from "./types";

// The reputation checker at the point of trade (global free trade,
// 2026-06-10): identity verification is gone; what replaces it is the
// counterparty's earned reputation, visible BEFORE the trade. The tier
// *name* is derived in TS from TRUST_TIERS (no tier column exists in the
// DB) — same derivation auction/state.ts uses.
export interface BestAskSeller {
  user_id: string;
  username: string | null;
  trust_score: number | null;
  tier: string | null;
  avg_rating: number | null;
  review_count: number;
}

// Tape rows carry the seller's tier so the recent-trades table can render
// a TrustTier chip next to the seller link. Null when the seller has no
// trust profile yet.
export type TapeTrade = MarketTrade & { seller_tier?: string | null };

// Best ask + the seller behind it. Single cheap query — the order book
// aggregates by price (no user ids), so this resolves the lowest-priced
// open ask order to its seller and joins users + trust_profiles for the
// reputation read. Returns null when there are no asks.
async function fetchBestAskSeller(sku: string): Promise<BestAskSeller | null> {
  const r = await query(
    `SELECT mo.user_id, u.username,
            tp.trust_score, tp.avg_rating, tp.total_reviews
       FROM market_orders mo
       LEFT JOIN users u ON u.id = mo.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = mo.user_id
      WHERE mo.sku = $1 AND mo.side = 'ask'
        AND mo.status IN ('open', 'partially_filled')
      ORDER BY mo.price ASC, mo.created_at ASC
      LIMIT 1`,
    [sku]
  );
  const row = r.rows[0];
  if (!row) return null;
  const score = row.trust_score != null ? Number(row.trust_score) : null;
  return {
    user_id: row.user_id,
    username: row.username ?? null,
    trust_score: score,
    tier: score !== null ? getTrustTier(score).name : null,
    avg_rating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
    review_count: row.total_reviews != null ? Number(row.total_reviews) : 0,
  };
}

// Batched tier lookup for the recent-trades tape (≤20 rows, one query).
async function fetchTapeSellerTiers(sellerIds: string[]): Promise<Map<string, string>> {
  if (sellerIds.length === 0) return new Map();
  const placeholders = sellerIds.map((_, i) => `$${i + 1}`).join(", ");
  const r = await query(
    `SELECT user_id, trust_score FROM trust_profiles WHERE user_id IN (${placeholders})`,
    sellerIds
  );
  const map = new Map<string, string>();
  for (const row of r.rows) {
    if (row.trust_score != null) {
      map.set(String(row.user_id), getTrustTier(Number(row.trust_score)).name);
    }
  }
  return map;
}

export interface UnifiedMarketView {
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;

  // Reference price — a catalog observation kept as a price-guide hint.
  // Not an offer; the platform holds no position in this market.
  reference_price: number | null;

  // The P2P order book, untouched.
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  recent_trades: TapeTrade[];

  // Reputation checker: the seller behind the best ask.
  best_ask_seller: BestAskSeller | null;

  // Derived from the pure P2P book.
  best_bid: number | null;
  best_ask: number | null;
  market_price: number | null;
  spread: number | null;
}

export async function getUnifiedMarketView(sku: string): Promise<UnifiedMarketView> {
  // Every leg below has a catch — the unified view should always render
  // something. A failure in any one source falls back to a sensible empty
  // value rather than 500'ing the whole page (the page is the user's
  // primary view; degrading is much better than failing).
  const [card, orderBook, p2pAskSeller] = await Promise.all([
    fetchCard(sku).catch(() => null),
    getCardOrderBook(sku).catch((err): CardOrderBook => {
      console.error("[market/unified] getCardOrderBook failed:", err);
      return { sku, card_name: null, image_url: null, bids: [], asks: [], recent_trades: [], best_bid: null, best_ask: null };
    }),
    fetchBestAskSeller(sku).catch((err): BestAskSeller | null => {
      console.error("[market/unified] fetchBestAskSeller failed:", err);
      return null;
    }),
  ]);

  // Tape reputation: attach the seller's tier to each recent trade so the
  // page can chip the seller link. Depends on the order-book result, so it
  // runs after the parallel fetch; degrades to no chips on failure.
  const tapeSellerIds = [...new Set(
    orderBook.recent_trades.map((t) => t.seller_id).filter(Boolean),
  )];
  const tapeTiers = await fetchTapeSellerTiers(tapeSellerIds).catch((err) => {
    console.error("[market/unified] fetchTapeSellerTiers failed:", err);
    return new Map<string, string>();
  });
  const recentTrades: TapeTrade[] = orderBook.recent_trades.map((t) => ({
    ...t,
    seller_tier: tapeTiers.get(t.seller_id) ?? null,
  }));

  const referencePrice = card ? retailPrice(card.price_gbp, card.channel_price) : null;

  const bids = orderBook.bids;
  const asks = orderBook.asks;
  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

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
    recent_trades: recentTrades,
    best_ask_seller: p2pAskSeller,
    best_bid: bestBid,
    best_ask: bestAsk,
    market_price: bestAsk,
    spread,
  };
}
