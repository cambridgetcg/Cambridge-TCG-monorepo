// Unified market view: first-party collector order book only.
//
// Collectors-first (docs/decisions/2026-07-06-collectors-first.md): the
// platform holds NO position in this book. The house maker that used to
// live here — a synthetic CTCG ask from catalog stock, a standing
// trade-in-credit bid, and a demand-pressure spread engine that tightened
// both — was removed on 2026-07-06. Every row in `bids`/`asks` is now a
// collector's order; the platform facilitates, records, and publishes,
// but does not buy, sell, or quote.
//
import { getTrustTier } from "@/lib/escrow/trust-engine";
import { getCardOrderBook } from "./db";
import { query } from "@/lib/db";
import type { CardOrderBook, PublicMarketTrade, OrderBookEntry } from "./types";
import { parseSkuShape } from "@/lib/search/resolver";

// The reputation checker at the point of trade (global free trade,
// 2026-06-10): identity verification is gone; what replaces it is the
// counterparty's earned reputation, visible BEFORE the trade. The tier
// *name* is derived in TS from TRUST_TIERS (no tier column exists in the
// DB) — same derivation auction/state.ts uses.
export interface BestAskSeller {
  username: string | null;
  trust_score: number | null;
  tier: string | null;
  avg_rating: number | null;
  review_count: number;
}

// Tape rows carry the seller's tier so the recent-trades table can render
// a TrustTier chip next to the seller link. Null when the seller has no
// trust profile yet.
export type TapeTrade = PublicMarketTrade;

// Best ask + the seller behind it. Single cheap query — the order book
// aggregates by price (no user ids), so this resolves the lowest-priced
// open ask order to its seller and joins users + trust_profiles for the
// reputation read. Returns null when there are no asks.
async function fetchBestAskSeller(sku: string): Promise<BestAskSeller | null> {
  const r = await query(
    `SELECT u.username,
            tp.trust_score, tp.avg_rating, tp.total_reviews
       FROM market_orders mo
       JOIN users u ON u.id = mo.user_id
       LEFT JOIN trust_profiles tp ON tp.user_id = mo.user_id
      WHERE mo.sku = $1 AND mo.side = 'ask'
        AND mo.status IN ('open', 'partially_filled')
        AND u.is_public = TRUE
        AND COALESCE(tp.is_suspended, FALSE) = FALSE
      ORDER BY mo.price ASC, mo.created_at ASC
      LIMIT 1`,
    [sku]
  );
  const row = r.rows[0];
  if (!row) return null;
  const score = row.trust_score != null ? Number(row.trust_score) : null;
  return {
    username: row.username ?? null,
    trust_score: score,
    tier: score !== null ? getTrustTier(score).name : null,
    avg_rating: row.avg_rating != null ? parseFloat(row.avg_rating) : null,
    review_count: row.total_reviews != null ? Number(row.total_reviews) : 0,
  };
}

export interface UnifiedMarketView {
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;

  // Explicitly withheld: no affirmative field-level lineage exists for the
  // former wholesale reference value.
  reference_price: number | null;

  // Pure collector order book — no house rows on either side.
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  recent_trades: TapeTrade[];

  // Reputation checker: the seller behind the best ask.
  best_ask_seller: BestAskSeller | null;

  // Derived from the collector book only.
  best_bid: number | null;
  best_ask: number | null;
  market_price: number | null;
  spread: number | null;
  // Withheld because it would derive from the restricted reference value.
  p2p_discount: number | null;
}

export async function getUnifiedMarketView(sku: string): Promise<UnifiedMarketView> {
  // Every leg below has a catch — the unified view should always render
  // something. A failure in any one source falls back to a sensible empty
  // value rather than 500'ing the whole page (the page is the user's
  // primary view; degrading is much better than failing).
  const [orderBook, p2pAskSeller] = await Promise.all([
    getCardOrderBook(sku).catch((err): CardOrderBook => {
      console.error("[market/unified] getCardOrderBook failed:", err);
      return { sku, card_name: null, image_url: null, bids: [], asks: [], recent_trades: [], best_bid: null, best_ask: null };
    }),
    fetchBestAskSeller(sku).catch((err): BestAskSeller | null => {
      console.error("[market/unified] fetchBestAskSeller failed:", err);
      return null;
    }),
  ]);

  const recentTrades: TapeTrade[] = orderBook.recent_trades;

  const bids: OrderBookEntry[] = orderBook.bids;
  const asks: OrderBookEntry[] = orderBook.asks;

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  const parsed = parseSkuShape(sku);

  return {
    sku,
    card_name: null,
    card_number: parsed?.number ?? null,
    set_code: parsed?.set.toUpperCase() ?? null,
    set_name: null,
    image_url: null,
    rarity: null,
    reference_price: null,
    bids,
    asks,
    recent_trades: recentTrades,
    best_ask_seller: p2pAskSeller,
    best_bid: bestBid,
    best_ask: bestAsk,
    market_price: bestAsk,
    spread,
    p2p_discount: null,
  };
}
