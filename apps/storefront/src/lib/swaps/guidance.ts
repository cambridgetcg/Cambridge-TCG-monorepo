// DB-backed price guidance for collector swaps.
//
// Two local sources, tried in order per sku:
//   1. recent_trades — median price of the sku's completed-path
//      market_trades over the last 90 days (up to the 10 most recent).
//      Real money that actually moved on this platform.
//   2. ctcg_spot_snapshot — the latest card_price_history.spot_gbp row
//      (the daily CTCG spot capture).
// Neither source → null, surfaced as "unpriced" (never zero).
//
// Both are one query over the whole sku set, not per-sku round-trips.
// The per-sku own-tape fair-value endpoint exists but is too expensive
// to call once per swap item; this module is the deliberate cheap path.
// All results carry source + as-of so the UI can label provenance.

import { query } from "@/lib/db";
import {
  median,
  totalSide,
  suggestCashDelta,
  type GuidanceItemInput,
  type SideTotal,
  type SkuGuidance,
} from "./guidance-core";

export interface SwapGuidance {
  perSku: Record<string, SkuGuidance>;
  proposer: SideTotal;
  recipient: SideTotal;
  /** recipientTotal − proposerTotal, pence. Positive = proposer's side is lighter. */
  suggestedCashDeltaPence: number | null;
  /** When this guidance was computed (request time — the totals are live
   *  arithmetic over the snapshot/trade sources named per sku). */
  computedAt: string;
}

const RECENT_TRADES_WINDOW_DAYS = 90;
const RECENT_TRADES_PER_SKU = 10;

/** Escrow states counted as "money actually moved" for guidance purposes. */
const PRICED_TRADE_STATES = ["completed", "shipped_to_buyer", "verified"] as const;

export async function guidanceForSkus(skus: string[]): Promise<Map<string, SkuGuidance>> {
  const unique = [...new Set(skus)].filter(Boolean);
  const map = new Map<string, SkuGuidance>();
  if (unique.length === 0) return map;

  // Source 1: recent trades, most recent N per sku, medianed.
  const trades = await query(
    `SELECT sku, price, created_at FROM (
       SELECT sku, price, created_at,
              ROW_NUMBER() OVER (PARTITION BY sku ORDER BY created_at DESC) AS rn
         FROM market_trades
        WHERE sku = ANY($1)
          AND escrow_status::text = ANY($2)
          AND created_at > NOW() - make_interval(days => $3)
     ) t WHERE rn <= $4`,
    [unique, [...PRICED_TRADE_STATES], RECENT_TRADES_WINDOW_DAYS, RECENT_TRADES_PER_SKU],
  );
  const bySku = new Map<string, { prices: number[]; newest: string }>();
  for (const row of trades.rows) {
    const pence = Math.round(parseFloat(String(row.price)) * 100);
    if (!Number.isFinite(pence)) continue;
    const entry = bySku.get(row.sku) ?? { prices: [], newest: String(row.created_at) };
    entry.prices.push(pence);
    if (String(row.created_at) > entry.newest) entry.newest = String(row.created_at);
    bySku.set(row.sku, entry);
  }
  for (const [sku, entry] of bySku) {
    map.set(sku, {
      sku,
      indicativePence: median(entry.prices),
      source: "recent_trades",
      asOf: new Date(entry.newest).toISOString(),
      sampleSize: entry.prices.length,
    });
  }

  // Source 2: latest CTCG spot snapshot for anything trades didn't cover.
  const uncovered = unique.filter((sku) => !map.has(sku));
  if (uncovered.length > 0) {
    const spots = await query(
      `SELECT DISTINCT ON (sku) sku, spot_gbp, captured_on
         FROM card_price_history
        WHERE sku = ANY($1)
        ORDER BY sku, captured_on DESC`,
      [uncovered],
    );
    for (const row of spots.rows) {
      const pence = Math.round(parseFloat(String(row.spot_gbp)) * 100);
      if (!Number.isFinite(pence)) continue;
      map.set(row.sku, {
        sku: row.sku,
        indicativePence: pence,
        source: "ctcg_spot_snapshot",
        asOf: new Date(String(row.captured_on)).toISOString(),
        sampleSize: 0,
      });
    }
  }

  // Anything still uncovered is honestly unpriced.
  for (const sku of unique) {
    if (!map.has(sku)) {
      map.set(sku, { sku, indicativePence: null, source: null, asOf: null, sampleSize: 0 });
    }
  }
  return map;
}

/** Full guidance for a two-sided item set — the shape the composer UI and
 *  the create path both consume. */
export async function swapGuidance(
  proposerItems: GuidanceItemInput[],
  recipientItems: GuidanceItemInput[],
): Promise<SwapGuidance> {
  const allSkus = [...proposerItems, ...recipientItems].map((i) => i.sku);
  const perSkuMap = await guidanceForSkus(allSkus);
  const proposer = totalSide(proposerItems, perSkuMap);
  const recipient = totalSide(recipientItems, perSkuMap);
  return {
    perSku: Object.fromEntries(perSkuMap),
    proposer,
    recipient,
    suggestedCashDeltaPence: suggestCashDelta(proposer, recipient),
    computedAt: new Date().toISOString(),
  };
}
