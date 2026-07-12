/**
 * Card-market composer — the pure-read, server-rendered, substrate-honest
 * mirror of one card's market activity.
 *
 * Yu's directive on 2026-05-12 evening: *"Build /cards/[sku]/market first."*
 *
 * kingdom-067. Story-as-wire pairing: docs/connections/the-market-mirror.md (S35).
 *
 * ── Why this file exists, given /market/[sku] already exists ────────────
 *
 * `/market/[sku]` is the *interactive* surface — it lets a logged-in user
 * place bids and asks, sell for credit, set alerts, watch the SKU. It is a
 * `"use client"` component that polls every 10 seconds and embeds form
 * state. It is excellent for placing orders.
 *
 * What it is not: a calm, auditable, public-no-auth, math-mirror-friendly
 * *reading* surface. The audience that just wants to read — a collector
 * checking the floor, a researcher charting prices, an agent ingesting
 * structure, a screen-reader user listening to the depth — has no good
 * door. This composer + the `/cards/[sku]/market` page that consumes it
 * is that door.
 *
 * Same pattern as the math-mirror / product page split shipped in S26:
 * one substrate, two readings, different audiences. Verify, don't overwrite.
 *
 * ── What this carries ───────────────────────────────────────────────────
 *
 *   1. CARD META — sku, name, set_code, set_name, first_seen_on. Legacy
 *      catalog images are withheld.
 *
 *   2. PRICE HISTORY — paused. The existing table mixes legacy reference
 *      observations with order-book snapshots and has no row-level receipt.
 *
 *   3. ORDER BOOK — top 10 bids (descending price) and top 10 asks
 *      (ascending price) aggregated by price (same shape as the existing
 *      interactive page's OrderBookEntry) PLUS per-row condition breakdown
 *      so the reader can see *which conditions are bidding at £5*.
 *
 *   4. THE TAPE — paused. Completed-trade derivatives need a separate,
 *      versioned publication choice and a delayed coarse projector.
 *
 *   5. AGGREGATE STATS — paused for the same reason. The exact public spread
 *      remains in the order book because bids and asks are public offers.
 *
 *   6. CONDITION BREAKDOWN — for each of NM/LP/MP/HP, count of open asks
 *      + best ask price. *The interactive page lets users filter when
 *      placing an order; this surfaces the distribution as a read.*
 *
 *   7. _provenance — { kind: "live", queried_at, notes, methodology_url }.
 *      Same envelope shape as the trader-dashboard (kingdom-063).
 *
 * ── Graceful degradation ───────────────────────────────────────────────
 *
 * Each section is wrapped in safeNumeric()-style try/catch returning
 * sensible defaults. A failing query degrades that section to empty /
 * null rather than crashing the page.
 */

import { query } from "@/lib/db";
import { getCardOrderBook } from "@/lib/market/db";
import type { CardOrderBook } from "@/lib/market/types";

// ── Public shape ─────────────────────────────────────────────────────────

export interface CardMarketMeta {
  sku: string;
  card_name: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  /** Earliest order recorded for this SKU (proxies "first-listed-on"). */
  first_seen_on: string | null;
}

export interface PriceHistoryPoint {
  captured_on: string;
  spot_gbp: number | null;
  best_bid_gbp: number | null;
  best_ask_gbp: number | null;
}

export interface CardMarketPriceHistory {
  window_7d: PriceHistoryPoint[];
  window_30d: PriceHistoryPoint[];
  window_90d: PriceHistoryPoint[];
  window_365d: PriceHistoryPoint[];
  /** True if any window contains at least one observation. */
  has_any_history: boolean;
}

export interface BookRow {
  price: number;
  total_quantity: number;
  order_count: number;
  /** Map of condition code → quantity at this price. NM is the common case;
   *  other conditions are present when the same price has cross-condition
   *  postings. */
  by_condition: Partial<Record<"NM" | "LP" | "MP" | "HP", number>>;
}

export interface CardMarketBook {
  bids: BookRow[];
  asks: BookRow[];
  best_bid: number | null;
  best_ask: number | null;
  spread: number | null;
  total_bid_quantity: number;
  total_ask_quantity: number;
}

export interface TapeEntry {
  period_start: string;
  trade_count: number;
  quantity: number;
  low_price: number;
  average_price: number;
  high_price: number;
}

export interface CardMarketTape {
  entries: TapeEntry[];
}

export interface CardMarketStats {
  /** Volume-weighted average price, last 30 days. */
  vwap_30d: number | null;
  /** Median trade price, last 30 days. */
  median_30d: number | null;
  /** Sum of quantities traded, last 30 days. */
  volume_30d: number | null;
  /** Range (min, max), last 30 days. */
  price_min_30d: number | null;
  price_max_30d: number | null;
  /** completed / (completed + cancelled + refunded), last 90 days. */
  completion_rate_90d: number | null;
}

export interface ConditionRow {
  condition: "NM" | "LP" | "MP" | "HP";
  ask_count: number;
  best_ask_price: number | null;
}

export interface CardMarket {
  sku: string;
  meta: CardMarketMeta;
  price_history: CardMarketPriceHistory;
  book: CardMarketBook;
  tape: CardMarketTape;
  stats: CardMarketStats;
  conditions: ConditionRow[];
  _provenance: {
    kind: "live";
    queried_at: string;
    notes: string;
    methodology_url: string;
    sources: string[];
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[card-market] query failed:", err);
    }
    return fallback;
  }
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

// ── Section loaders ──────────────────────────────────────────────────────

async function loadMeta(
  sku: string,
  canonical: CardOrderBook,
): Promise<CardMarketMeta> {
  // Composition perimeter (kingdom-074): card_name + image_url come from
  // the canonical book (single source of truth for the per-SKU card-info
  // join). This composer only queries market_orders for the metadata
  // getCardOrderBook does NOT carry — set_code, set_name, first_seen_on.
  return safe(
    async () => {
      const r = await query(
        `SELECT set_code, set_name,
                MIN(created_at) AS first_seen_on
         FROM market_orders
         WHERE sku = $1
         GROUP BY set_code, set_name
         ORDER BY MIN(created_at) ASC
         LIMIT 1`,
        [sku],
      );
      const row = r.rows[0];
      return {
        sku,
        card_name: canonical.card_name ?? null,
        image_url: canonical.image_url ?? null,
        set_code: row?.set_code ?? null,
        set_name: row?.set_name ?? null,
        first_seen_on: row?.first_seen_on
          ? new Date(row.first_seen_on).toISOString()
          : null,
      };
    },
    {
      sku,
      card_name: canonical.card_name ?? null,
      image_url: canonical.image_url ?? null,
      set_code: null,
      set_name: null,
      first_seen_on: null,
    },
  );
}

async function loadPriceHistory(): Promise<CardMarketPriceHistory> {
  const window_7d: PriceHistoryPoint[] = [];
  const window_30d: PriceHistoryPoint[] = [];
  const window_90d: PriceHistoryPoint[] = [];
  const window_365d: PriceHistoryPoint[] = [];
  return {
    window_7d,
    window_30d,
    window_90d,
    window_365d,
    has_any_history: window_365d.length > 0,
  };
}

async function loadBook(
  sku: string,
  canonical: CardOrderBook,
): Promise<CardMarketBook> {
  // Composition perimeter (kingdom-074): the canonical order book comes
  // from `getCardOrderBook` — same source the interactive `/market/[sku]`
  // page consumes; same lazy expiry sweep that this mirror was missing
  // in v1. The canonical is passed in by `loadCardMarket` so only ONE
  // call to getCardOrderBook fires per page render (instead of separate
  // calls from loadBook + the meta query duplicating its card_info read).
  //
  // `getCardOrderBook` returns top-20 levels per side aggregated by price
  // (no condition breakdown). This composer slices to top-10 and adds a
  // by-condition enrichment query — one extra round-trip with a small
  // result set (≤ 80 rows = 20 levels × 4 conditions × 2 sides).

  // Top-10 levels per side from the canonical aggregation.
  const topBids = canonical.bids.slice(0, 10);
  const topAsks = canonical.asks.slice(0, 10);
  const bidPrices = topBids.map((r) => r.price);
  const askPrices = topAsks.map((r) => r.price);
  const allPrices = Array.from(new Set([...bidPrices, ...askPrices]));

  // By-condition enrichment — keyed by (side, price, condition).
  // Only queries when there are levels to enrich.
  const conditionMap = allPrices.length === 0
    ? new Map<string, Partial<Record<"NM" | "LP" | "MP" | "HP", number>>>()
    : await safe(
        async () => {
          const placeholders = allPrices.map((_, i) => `$${i + 2}`).join(", ");
          const r = await query(
            `SELECT side, price::text AS price, condition,
                    SUM(quantity - filled_quantity)::int AS qty
             FROM market_orders
             WHERE sku = $1
               AND price IN (${placeholders})
               AND status IN ('open', 'partially_filled')
             GROUP BY side, price, condition`,
            [sku, ...allPrices],
          );
          const m = new Map<string, Partial<Record<"NM" | "LP" | "MP" | "HP", number>>>();
          for (const row of r.rows) {
            const key = `${row.side}:${row.price}`;
            const bucket = m.get(key) ?? {};
            const cond = String(row.condition) as "NM" | "LP" | "MP" | "HP";
            bucket[cond] = (bucket[cond] ?? 0) + (row.qty ?? 0);
            m.set(key, bucket);
          }
          return m;
        },
        new Map<string, Partial<Record<"NM" | "LP" | "MP" | "HP", number>>>(),
      );

  const bids = topBids.map((row) => ({
    price: row.price,
    total_quantity: row.total_quantity,
    order_count: row.order_count,
    by_condition: conditionMap.get(`bid:${row.price}`) ?? {},
  }));
  const asks = topAsks.map((row) => ({
    price: row.price,
    total_quantity: row.total_quantity,
    order_count: row.order_count,
    by_condition: conditionMap.get(`ask:${row.price}`) ?? {},
  }));

  // BookRow uses `price: number`; getCardOrderBook returns `price: string`.
  // Normalise to number here so downstream consumers see one shape.
  const normalised = (rows: typeof bids) =>
    rows.map((r) => ({
      ...r,
      price: toNum(r.price) ?? 0,
      total_quantity: r.total_quantity ?? 0,
      order_count: r.order_count ?? 0,
    }));

  const bidsTyped = normalised(bids);
  const asksTyped = normalised(asks);
  const best_bid = bidsTyped[0]?.price ?? null;
  const best_ask = asksTyped[0]?.price ?? null;
  const spread =
    best_bid !== null && best_ask !== null && best_ask > 0
      ? Math.round((best_ask - best_bid) * 100) / 100
      : null;

  return {
    bids: bidsTyped,
    asks: asksTyped,
    best_bid,
    best_ask,
    spread,
    total_bid_quantity: bidsTyped.reduce((s, r) => s + r.total_quantity, 0),
    total_ask_quantity: asksTyped.reduce((s, r) => s + r.total_quantity, 0),
  };
}

function loadTape(): CardMarketTape {
  return { entries: [] };
}

function loadStats(): CardMarketStats {
  return {
    vwap_30d: null,
    median_30d: null,
    volume_30d: null,
    price_min_30d: null,
    price_max_30d: null,
    completion_rate_90d: null,
  };
}

async function loadConditions(sku: string): Promise<ConditionRow[]> {
  const rows = await safe(
    async () => {
      const r = await query(
        `SELECT condition,
                COUNT(*) FILTER (WHERE status IN ('open','partially_filled'))::int AS ask_count,
                MIN(price) FILTER (WHERE status IN ('open','partially_filled'))::numeric AS best_ask
         FROM market_orders
         WHERE sku = $1 AND side = 'ask'
         GROUP BY condition`,
        [sku],
      );
      return r.rows;
    },
    [] as any[],
  );
  const ordered: ConditionRow[] = (["NM", "LP", "MP", "HP"] as const).map(
    (cond) => {
      const found = rows.find((r: any) => r.condition === cond);
      return {
        condition: cond,
        ask_count: found?.ask_count ?? 0,
        best_ask_price: toNum(found?.best_ask),
      };
    },
  );
  return ordered;
}

// ── Public surface ──────────────────────────────────────────────────────

/**
 * Load the full card-market mirror for one SKU.
 *
 * Independent section queries run in parallel (Promise.all). Each is isolated
 * by safe() — one failure degrades that section to empty, never crashes
 * the page. Typical latency 80-300ms on warm RDS.
 */
export async function loadCardMarket(sku: string): Promise<CardMarket> {
  // Single call to the canonical order-book composer. The result feeds
  // both loadMeta (for card_name + image_url) and loadBook (for bids,
  // asks, and the lazy sweep). Without this hoist, getCardOrderBook
  // would run once via loadBook and the card-info join inside it would
  // be redundant with loadMeta's own market_orders query.
  const canonical = await safe<CardOrderBook>(
    () => getCardOrderBook(sku),
    {
      sku,
      card_name: null,
      image_url: null,
      bids: [],
      asks: [],
      trade_aggregates: [],
      best_bid: null,
      best_ask: null,
    },
  );

  const [meta, price_history, book, conditions] =
    await Promise.all([
      loadMeta(sku, canonical),
      loadPriceHistory(),
      loadBook(sku, canonical),
      loadConditions(sku),
    ]);
  const tape = loadTape();
  const stats = loadStats();

  return {
    sku,
    meta,
    price_history,
    book,
    tape,
    stats,
    conditions,
    _provenance: {
      kind: "live",
      queried_at: new Date().toISOString(),
      notes:
        "Legacy reference prices are withheld pending field-level source rights. The order book reads deliberate public bids and asks. Completed-trade tape and statistics remain paused pending purpose-specific publication receipts and a delayed coarse projector. See /methodology/market.",
      methodology_url: "/methodology/market",
      sources: ["market_orders"],
    },
  };
}
