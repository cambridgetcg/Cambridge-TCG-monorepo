// Unified market view: CTCG as two-sided market maker
//
// CTCG provides liquidity on BOTH sides:
//   ASK side: catalog retail price (buy from CTCG)
//   BID side: trade-in credit price (sell to CTCG for store credit)
//
// Store credit is the absorption mechanism — it can only be spent at CTCG,
// creating a flywheel: sell cards → get credit → buy cards → sell cards
//
// Dynamic spread:
//   When buyer demand (watches + active alerts) exceeds current P2P supply
//   by a wide margin, CTCG's synthetic ask/bid tighten toward the market
//   so the house actively competes for both sides of imbalanced flow.
//   Tightening is capped at ±3% and always surfaced with an "active maker"
//   flag in the response so UIs can label the adjusted rows.
//
//   Settlement remains static (catalog retail, trade-in credit) — the
//   tightened prices are an indicative market-making signal. A future pass
//   will honor the displayed bid when the user locks it at submission time.

import { fetchCard, fetchPrices } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { getCardOrderBook } from "./db";
import { query } from "@/lib/db";
import type { CardOrderBook, OrderBookEntry } from "./types";

export interface HouseOrderEntry extends OrderBookEntry {
  is_house?: boolean;
  is_credit?: boolean; // true = paid in store credit, not cash
  label?: string;
  is_dynamic?: boolean;    // true if the price was tightened from baseline
  baseline_price?: string; // the un-tightened reference when is_dynamic
}

// Tunables for the dynamic spread. Tightening never exceeds these caps;
// the visible baseline column is kept for audit + UI labelling.
const MAX_TIGHTEN_PCT = 0.03;   // 3% is the hard ceiling on each side
const DEMAND_BASELINE = 3;      // below this score, no tightening at all
const ALERT_WEIGHT = 2;         // active alerts count double vs. passive watches

interface DemandPressure {
  watchCount: number;
  alertCount: number;
  askDepth: number;
  bidDepth: number;
  // 0 → no pressure, 1 → maximum; symmetric output, clients pick direction
  pressure: number;
}

async function computeDemandPressure(sku: string): Promise<DemandPressure> {
  const r = await query(
    `SELECT
       (SELECT COUNT(*)::int FROM market_watches WHERE sku = $1) AS watch_count,
       (SELECT COUNT(*)::int FROM price_alerts
         WHERE sku = $1 AND direction = 'below' AND active = true) AS alert_count,
       (SELECT COALESCE(SUM(quantity - filled_quantity), 0)::int FROM market_orders
         WHERE sku = $1 AND side = 'ask' AND status IN ('open','partially_filled')) AS ask_depth,
       (SELECT COALESCE(SUM(quantity - filled_quantity), 0)::int FROM market_orders
         WHERE sku = $1 AND side = 'bid' AND status IN ('open','partially_filled')) AS bid_depth`,
    [sku]
  );
  const row = r.rows[0] || {};
  const watchCount = row.watch_count ?? 0;
  const alertCount = row.alert_count ?? 0;
  const askDepth = row.ask_depth ?? 0;
  const bidDepth = row.bid_depth ?? 0;

  // Pressure = excess demand over baseline, discounted by ask supply.
  // Returns 0 if watch/alert signal is under baseline OR if supply is deep
  // enough to meet it. Saturates at 1 for screaming mismatches.
  const demand = watchCount + alertCount * ALERT_WEIGHT;
  const excess = Math.max(0, demand - DEMAND_BASELINE);
  const supplyDamp = 1 / (1 + askDepth);   // 0 asks → 1, 10 asks → 0.09
  const raw = excess * 0.05 * supplyDamp;
  const pressure = Math.min(1, raw);
  return { watchCount, alertCount, askDepth, bidDepth, pressure };
}

export interface UnifiedMarketView {
  sku: string;
  card_name: string | null;
  card_number: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  rarity: string | null;

  // CTCG spot price (always-available liquidity — sell side)
  spot_price: number | null;
  spot_stock: number;

  // CTCG trade-in (always-available liquidity — buy side)
  tradein_credit: number | null;  // Store credit offer
  tradein_cash: number | null;    // Cash offer (lower)

  // Merged order book (CTCG injected on BOTH sides)
  bids: HouseOrderEntry[];
  asks: HouseOrderEntry[];
  recent_trades: CardOrderBook["recent_trades"];

  // Derived
  best_bid: number | null;
  best_ask: number | null;
  market_price: number | null;
  spread: number | null;
  p2p_discount: number | null;
  ctcg_spread: number | null;    // retail - tradein credit = CTCG margin

  // Demand pressure — surfaced on the panel and used to tighten house
  // prices. Always present (0 when no signal). Clients can use this to
  // render "🔥 High demand" pills or similar.
  demand_pressure: {
    watchCount: number;
    alertCount: number;
    askDepth: number;
    bidDepth: number;
    pressure: number;      // 0..1 — higher = more buy-side pressure
    tightenPct: number;    // the actual tightening applied (≤ MAX_TIGHTEN_PCT)
  };
}

export async function getUnifiedMarketView(sku: string): Promise<UnifiedMarketView> {
  // Derive set_code from SKU (e.g. "OP-OP01-025-JP-V11D5" → "OP01", "EB-EB01-006-JP-VZSK" → "EB01")
  const skuParts = sku.split("-");
  const setCode = skuParts.length >= 2 ? skuParts[1] : undefined;

  const [card, orderBook, tradeinCreditRes, tradeinCashRes, pressure] = await Promise.all([
    fetchCard(sku).catch(() => null),
    getCardOrderBook(sku),
    // Use batch fetchPrices instead of fetchCard for trade-in channels
    // (individual SKU lookup may not support trade-in channels)
    setCode ? fetchPrices({ game: "one-piece", set: setCode, channel: "tradein-credit", limit: 500 }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    setCode ? fetchPrices({ game: "one-piece", set: setCode, channel: "tradein-cash", limit: 500 }).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
    computeDemandPressure(sku),
  ]);

  // Actual tightening percentage used for THIS view. Capped at MAX_TIGHTEN_PCT.
  const tightenPct = Math.min(pressure.pressure, 1) * MAX_TIGHTEN_PCT;

  // Find this specific SKU in the trade-in results
  const tradeinCreditItem = tradeinCreditRes.items.find(i => i.sku === sku);
  const tradeinCashItem = tradeinCashRes.items.find(i => i.sku === sku);
  const tradeinCredit = tradeinCreditItem?.channel_price ?? null;
  const tradeinCash = tradeinCashItem?.channel_price ?? null;
  const spotPrice = card ? retailPrice(card.price_gbp, card.channel_price) : null;
  const spotStock = card?.stock ?? 0;

  // ── Build ASKS (sell side) ──
  // Inject CTCG retail price as house ask; tighten DOWN when buy-pressure is high.
  const asks: HouseOrderEntry[] = [...orderBook.asks];
  if (spotPrice && spotStock > 0) {
    const tightenedAsk = spotPrice * (1 - tightenPct);
    const houseAsk: HouseOrderEntry = {
      price: tightenedAsk.toFixed(2),
      total_quantity: spotStock,
      order_count: 1,
      is_house: true,
      label: "CTCG Store",
      ...(tightenPct > 0 ? {
        is_dynamic: true,
        baseline_price: spotPrice.toFixed(2),
      } : {}),
    };
    let inserted = false;
    for (let i = 0; i < asks.length; i++) {
      if (tightenedAsk <= parseFloat(asks[i].price)) {
        asks.splice(i, 0, houseAsk);
        inserted = true;
        break;
      }
    }
    if (!inserted) asks.push(houseAsk);
  }

  // ── Build BIDS (buy side) ──
  // Inject CTCG trade-in credit as house bid; tighten UP when buy-pressure is
  // high (raise our bid to capture supply). Same tighten factor for symmetry.
  const bids: HouseOrderEntry[] = [...orderBook.bids];
  if (tradeinCredit && tradeinCredit > 0) {
    const tightenedBid = tradeinCredit * (1 + tightenPct);
    const houseBid: HouseOrderEntry = {
      price: tightenedBid.toFixed(2),
      total_quantity: 999, // Always willing to buy
      order_count: 1,
      is_house: true,
      is_credit: true,
      label: "CTCG Credit",
      ...(tightenPct > 0 ? {
        is_dynamic: true,
        baseline_price: tradeinCredit.toFixed(2),
      } : {}),
    };
    let inserted = false;
    for (let i = 0; i < bids.length; i++) {
      if (tightenedBid >= parseFloat(bids[i].price)) {
        bids.splice(i, 0, houseBid);
        inserted = true;
        break;
      }
    }
    if (!inserted) bids.push(houseBid);
  }

  const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
  const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;
  const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;

  let p2pDiscount: number | null = null;
  if (spotPrice && bestAsk && bestAsk < spotPrice) {
    p2pDiscount = Math.round(((spotPrice - bestAsk) / spotPrice) * 100);
  }

  const ctcgSpread = spotPrice && tradeinCredit ? spotPrice - tradeinCredit : null;

  return {
    sku,
    card_name: card?.name_en || card?.name || orderBook.card_name,
    card_number: card?.card_number || null,
    set_code: card?.set_code || null,
    set_name: card?.set_name || null,
    image_url: card?.image_url || orderBook.image_url,
    rarity: card?.rarity || null,
    spot_price: spotPrice,
    spot_stock: spotStock,
    tradein_credit: tradeinCredit,
    tradein_cash: tradeinCash,
    bids,
    asks,
    recent_trades: orderBook.recent_trades,
    best_bid: bestBid,
    best_ask: bestAsk,
    market_price: bestAsk,
    spread,
    p2p_discount: p2pDiscount,
    ctcg_spread: ctcgSpread,
    demand_pressure: {
      watchCount: pressure.watchCount,
      alertCount: pressure.alertCount,
      askDepth: pressure.askDepth,
      bidDepth: pressure.bidDepth,
      pressure: pressure.pressure,
      tightenPct,
    },
  };
}
