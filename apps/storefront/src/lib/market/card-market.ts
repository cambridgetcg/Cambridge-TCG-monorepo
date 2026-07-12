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
 *   1. CARD META — canonical SKU plus first-seen time from first-party
 *      orders. Denormalised/imported names, sets and images are withheld.
 *
 *   2. UPSTREAM PRICE HISTORY — withheld. Completed first-party trades and
 *      the live order book remain available in their own sections.
 *
 *   3. ORDER BOOK — top 10 bids (descending price) and top 10 asks
 *      (ascending price) aggregated by price (same shape as the existing
 *      interactive page's OrderBookEntry) PLUS per-row condition breakdown
 *      so the reader can see *which conditions are bidding at £5*.
 *
 *   4. THE TAPE — last 20 completed trades, with no person identifier,
 *      stable pseudonym, profile join, or trust attribute.
 *
 *   5. AGGREGATE STATS — spread, 30-day VWAP, 30-day median, 30-day
 *      volume, last-trade-price, last-trade-at, trade_count_24h, fill
 *      rate (completed / total in 90d). Same formulas as the existing
 *      fair-value endpoint.
 *
 *   6. CONDITION BREAKDOWN — for each of NM/LP/MP/HP, count of open asks
 *      + best ask price. *The interactive page lets users filter when
 *      placing an order; this surfaces the distribution as a read.*
 *
 *   7. RECURRING PARTICIPANTS — withheld. Small-cohort distinct-person and
 *      repeat-pair statistics can expose private trading relationships.
 *
 *   8. _provenance — { kind: "live", queried_at, notes, methodology_url }.
 *      Same envelope shape as the trader-dashboard (kingdom-063).
 *
 * ── Graceful degradation ───────────────────────────────────────────────
 *
 * Each section is wrapped in safeNumeric()-style try/catch returning
 * sensible defaults. A failing query degrades that section to empty /
 * null rather than crashing the page.
 */

import { createHash } from "node:crypto";
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
  public_ref: string;
  price: number;
  quantity: number;
  completed_at: string | null;
  created_at: string;
}

export interface CardMarketTape {
  entries: TapeEntry[];
  trade_count_24h: number;
  trade_count_7d: number;
  trade_count_30d: number;
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
  /** Last completed trade price + when. */
  last_trade_price: number | null;
  last_trade_at: string | null;
  /** completed / (completed + cancelled + refunded), last 90 days. */
  completion_rate_90d: number | null;
}

export interface ConditionRow {
  condition: "NM" | "LP" | "MP" | "HP";
  ask_count: number;
  best_ask_price: number | null;
}

export interface CardMarketParticipants {
  status: "withheld";
  distinct_buyers_90d: null;
  distinct_sellers_90d: null;
  repeat_pair_fraction_90d: number | null;
  reason: string;
}

export interface CardMarket {
  sku: string;
  meta: CardMarketMeta;
  price_history: CardMarketPriceHistory;
  book: CardMarketBook;
  tape: CardMarketTape;
  stats: CardMarketStats;
  conditions: ConditionRow[];
  participants: CardMarketParticipants;
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
  _canonical: CardOrderBook,
): Promise<CardMarketMeta> {
  // Order-cached names, set labels and image URLs have no affirmative
  // field-level rights lineage. Only the Cambridge SKU and first-party
  // first-listing time are public here.
  return safe(
    async () => {
      const r = await query(
        `SELECT MIN(created_at) AS first_seen_on
         FROM market_orders
         WHERE sku = $1`,
        [sku],
      );
      const row = r.rows[0];
      return {
        sku,
        card_name: null,
        image_url: null,
        set_code: null,
        set_name: null,
        first_seen_on: row?.first_seen_on
          ? new Date(row.first_seen_on).toISOString()
          : null,
      };
    },
    {
      sku,
      card_name: null,
      image_url: null,
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

async function loadTape(sku: string): Promise<CardMarketTape> {
  // Recent completed trades contain market facts only. Seller identity and
  // profile attributes are neither selected nor transformed into a pseudonym.
  const entries = await safe(
    async () => {
      const r = await query(
        `SELECT t.id, t.price::numeric AS price, t.quantity,
                t.completed_at, t.created_at
         FROM market_trades t
         WHERE t.sku = $1
           AND t.escrow_status = 'completed'
         ORDER BY COALESCE(t.completed_at, t.created_at) DESC
         LIMIT 20`,
        [sku],
      );
      return r.rows;
    },
    [] as any[],
  );

  const entriesTyped: TapeEntry[] = entries.map((row: any) => {
    return {
      public_ref: createHash("sha256")
        .update(`card-market-trade:${row.id}`)
        .digest("hex")
        .slice(0, 20),
      price: toNum(row.price) ?? 0,
      quantity: row.quantity ?? 0,
      completed_at: row.completed_at
        ? new Date(row.completed_at).toISOString()
        : null,
      created_at: new Date(row.created_at).toISOString(),
    };
  });

  const counts = await safe(
    async () => {
      const r = await query(
        `SELECT
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 day')::int AS c24,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days')::int AS c7,
           COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')::int AS c30
         FROM market_trades
         WHERE sku = $1 AND escrow_status = 'completed'`,
        [sku],
      );
      return r.rows[0] ?? { c24: 0, c7: 0, c30: 0 };
    },
    { c24: 0, c7: 0, c30: 0 },
  );

  return {
    entries: entriesTyped,
    trade_count_24h: counts.c24 ?? 0,
    trade_count_7d: counts.c7 ?? 0,
    trade_count_30d: counts.c30 ?? 0,
  };
}

async function loadStats(sku: string): Promise<CardMarketStats> {
  const fair = await safe(
    async () => {
      const r = await query(
        `WITH trades_30d AS (
           SELECT price::numeric AS price, quantity
           FROM market_trades
           WHERE sku = $1 AND escrow_status = 'completed'
             AND created_at > NOW() - INTERVAL '30 days'
         )
         SELECT
           (SUM(price * quantity) / NULLIF(SUM(quantity), 0))::numeric AS vwap,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric AS median,
           SUM(quantity)::int AS volume,
           MIN(price)::numeric AS min_p,
           MAX(price)::numeric AS max_p
         FROM trades_30d`,
        [sku],
      );
      return r.rows[0] ?? {};
    },
    {} as any,
  );

  const last = await safe(
    async () => {
      const r = await query(
        `SELECT price::numeric AS price, COALESCE(completed_at, created_at) AS at
         FROM market_trades
         WHERE sku = $1 AND escrow_status = 'completed'
         ORDER BY COALESCE(completed_at, created_at) DESC
         LIMIT 1`,
        [sku],
      );
      return r.rows[0] ?? {};
    },
    {} as any,
  );

  return {
    vwap_30d: toNum(fair.vwap),
    median_30d: toNum(fair.median),
    volume_30d: toNum(fair.volume),
    price_min_30d: toNum(fair.min_p),
    price_max_30d: toNum(fair.max_p),
    last_trade_price: toNum(last.price),
    last_trade_at: last.at ? new Date(last.at).toISOString() : null,
    // Withheld: cancelled/refunded outcomes are sensitive and a per-SKU
    // cohort is often small enough to disclose individual failures.
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

async function loadParticipants(sku: string): Promise<CardMarketParticipants> {
  void sku;
  return {
    status: "withheld",
    distinct_buyers_90d: null,
    distinct_sellers_90d: null,
    repeat_pair_fraction_90d: null,
    reason:
      "Distinct participant and repeat-pair statistics are withheld because small cohorts can expose private trading relationships.",
  };
}

// ── Public surface ──────────────────────────────────────────────────────

/**
 * Load the full card-market mirror for one SKU.
 *
 * Eight section queries run in parallel (Promise.all). Each is isolated
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
      recent_trades: [],
      best_bid: null,
      best_ask: null,
    },
  );

  const [meta, price_history, book, tape, stats, conditions, participants] =
    await Promise.all([
      loadMeta(sku, canonical),
      loadPriceHistory(),
      loadBook(sku, canonical),
      loadTape(sku),
      loadStats(sku),
      loadConditions(sku),
      loadParticipants(sku),
    ]);

  return {
    sku,
    meta,
    price_history,
    book,
    tape,
    stats,
    conditions,
    participants,
    _provenance: {
      kind: "live",
      queried_at: new Date().toISOString(),
      notes:
        "First-party order book, completed trades and aggregates were queried at this moment. Imported card metadata and card_price_history values are withheld because their field-level public rights lineage is not affirmative.",
      methodology_url: "/methodology/market",
      sources: [
        "market_orders",
        "market_trades",
      ],
    },
  };
}
