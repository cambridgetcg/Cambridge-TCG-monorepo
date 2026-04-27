// Enrich wishlist items with live availability info — cheapest eligible
// P2P ask and the current wholesale retail spot. Batched so a wishlist
// of 50 cards doesn't fire 50 sequential lookups.

import { query } from "@/lib/db";
import { fetchCard } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";

export interface WishlistItemLite {
  id: string;
  sku: string | null;
  max_price: string | null;
  condition_min: string;
}

export interface WishlistAvailability {
  wishlist_id: string;
  p2p_price: number | null;
  p2p_condition: string | null;
  p2p_qty: number;
  p2p_order_id: string | null;
  store_price: number | null;
  store_stock: number;
  // Does ANY source clear the user's max_price?
  matched: boolean;
  // Cheapest eligible price across sources (null if no match)
  best_price: number | null;
  best_source: "p2p" | "wholesale" | null;
}

const CONDITION_RANK: Record<string, number> = {
  NM: 5, LP: 4, MP: 3, HP: 2, DMG: 1,
};
function meetsCondition(candidate: string, min: string): boolean {
  const c = CONDITION_RANK[(candidate || "NM").toUpperCase()] ?? 0;
  const m = CONDITION_RANK[(min || "NM").toUpperCase()] ?? 5;
  return c >= m;
}

export async function enrichWishlist(items: WishlistItemLite[]): Promise<Map<string, WishlistAvailability>> {
  const out = new Map<string, WishlistAvailability>();
  const skus = [...new Set(items.map((i) => i.sku).filter((s): s is string => !!s))];
  if (skus.length === 0) return out;

  // One query for the cheapest open P2P ask per (sku, condition).
  const askRows = await query(
    `SELECT DISTINCT ON (sku, condition)
       id, sku, condition, price, (quantity - filled_quantity) AS remaining
     FROM market_orders
     WHERE side = 'ask'
       AND status IN ('open', 'partially_filled')
       AND sku = ANY($1::text[])
     ORDER BY sku, condition, price ASC`,
    [skus],
  );
  const asksBySku = new Map<
    string,
    Array<{ id: string; condition: string; price: number; remaining: number }>
  >();
  for (const a of askRows.rows) {
    const arr = asksBySku.get(a.sku) ?? [];
    arr.push({
      id: a.id,
      condition: a.condition,
      price: parseFloat(a.price),
      remaining: parseInt(a.remaining, 10),
    });
    asksBySku.set(a.sku, arr);
  }

  // Wholesale lookups in parallel. Same fetchCard as everywhere else;
  // Vercel's fetch layer de-dupes identical GETs within the request.
  const wholesaleResults = await Promise.all(
    skus.map(async (sku) => {
      try { return { sku, card: await fetchCard(sku) }; }
      catch { return { sku, card: null }; }
    }),
  );
  const wholesaleBySku = new Map(
    wholesaleResults.map((w) => [
      w.sku,
      w.card ? { price: retailPrice(w.card.price_gbp, w.card.channel_price), stock: w.card.stock } : null,
    ]),
  );

  for (const item of items) {
    const info: WishlistAvailability = {
      wishlist_id: item.id,
      p2p_price: null, p2p_condition: null, p2p_qty: 0, p2p_order_id: null,
      store_price: null, store_stock: 0,
      matched: false, best_price: null, best_source: null,
    };

    if (!item.sku) { out.set(item.id, info); continue; }

    const max = item.max_price != null ? parseFloat(item.max_price) : null;
    const conditionMin = (item.condition_min || "NM").toUpperCase();

    // Cheapest eligible P2P ask
    const asks = asksBySku.get(item.sku) ?? [];
    for (const a of asks) {
      if (a.remaining <= 0) continue;
      if (!meetsCondition(a.condition, conditionMin)) continue;
      if (!info.p2p_price || a.price < info.p2p_price) {
        info.p2p_price = a.price;
        info.p2p_condition = a.condition;
        info.p2p_qty = a.remaining;
        info.p2p_order_id = a.id;
      }
    }

    // Store
    const ws = wholesaleBySku.get(item.sku);
    if (ws && ws.stock > 0 && meetsCondition("NM", conditionMin)) {
      info.store_price = ws.price;
      info.store_stock = ws.stock;
    }

    // Best + matched
    const candidates: Array<{ price: number; source: "p2p" | "wholesale" }> = [];
    if (info.p2p_price != null) candidates.push({ price: info.p2p_price, source: "p2p" });
    if (info.store_price != null) candidates.push({ price: info.store_price, source: "wholesale" });
    candidates.sort((a, b) => a.price - b.price);
    if (candidates.length > 0) {
      info.best_price = candidates[0].price;
      info.best_source = candidates[0].source;
      info.matched = max == null ? true : candidates[0].price <= max;
    }

    out.set(item.id, info);
  }

  return out;
}
