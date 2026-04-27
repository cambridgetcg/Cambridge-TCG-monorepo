// Investor risk metrics — concentration + per-position liquidity.
//
// Both reads-only — no schema additions. Joins existing market data
// (orders + trades) and the user's portfolio rows.
//
// Liquidity score is a 0-100 composite intended for sorting and
// for highlighting positions that would be hard to exit. Inputs:
//   - bid depth (qty buyers want at any price)
//   - ask depth (qty sellers offering)
//   - bid/ask spread (tighter = more liquid)
//   - recent trade volume (qty * count over 30d)
//   - days since last trade (recency penalty after 14d)
//
// Concentration uses the Herfindahl-Hirschman Index (HHI) on portfolio
// value. HHI < 1500 = unconcentrated; 1500-2500 = moderate; > 2500 =
// highly concentrated. Investors should aim for HHI < 2000 for
// diversified TCG exposure.

import { query } from "@/lib/db";

export interface LiquidityScore {
  sku: string;
  score: number;            // 0-100
  bid_depth: number;        // total qty across open bids
  ask_depth: number;        // total qty across open asks
  spread_pct: number | null; // (best_ask - best_bid) / best_ask
  trades_30d_count: number;
  units_30d: number;
  days_since_last_trade: number | null;
  flag: "deep" | "ok" | "thin" | "stale";
}

export async function liquidityForSkus(skus: string[]): Promise<Map<string, LiquidityScore>> {
  const out = new Map<string, LiquidityScore>();
  if (skus.length === 0) return out;

  // One query per metric — three small ones beat a single complex
  // window-function join, and the SKU list is at most ~hundreds.
  const [bidsRes, asksRes, tradesRes] = await Promise.all([
    query(
      `SELECT sku,
              SUM(quantity - filled_quantity)::int AS depth,
              MAX(price)::numeric AS best
         FROM market_orders
        WHERE sku = ANY($1::text[])
          AND side = 'bid'
          AND status IN ('open', 'partially_filled')
        GROUP BY sku`,
      [skus],
    ),
    query(
      `SELECT sku,
              SUM(quantity - filled_quantity)::int AS depth,
              MIN(price)::numeric AS best
         FROM market_orders
        WHERE sku = ANY($1::text[])
          AND side = 'ask'
          AND status IN ('open', 'partially_filled')
        GROUP BY sku`,
      [skus],
    ),
    query(
      `SELECT sku,
              COUNT(*)::int AS cnt,
              SUM(quantity)::int AS units,
              EXTRACT(EPOCH FROM (NOW() - MAX(created_at))) / 86400 AS days_since
         FROM market_trades
        WHERE sku = ANY($1::text[])
          AND escrow_status NOT IN ('cancelled', 'refunded')
          AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY sku`,
      [skus],
    ),
  ]);

  const bids = new Map(bidsRes.rows.map((r): [string, { depth: number; best: number }] =>
    [r.sku, { depth: r.depth ?? 0, best: r.best ? parseFloat(r.best) : 0 }]));
  const asks = new Map(asksRes.rows.map((r): [string, { depth: number; best: number }] =>
    [r.sku, { depth: r.depth ?? 0, best: r.best ? parseFloat(r.best) : 0 }]));
  const trades = new Map(tradesRes.rows.map((r): [string, { cnt: number; units: number; days: number | null }] =>
    [r.sku, { cnt: r.cnt ?? 0, units: r.units ?? 0, days: r.days_since !== null ? parseFloat(r.days_since) : null }]));

  for (const sku of skus) {
    const b = bids.get(sku);
    const a = asks.get(sku);
    const t = trades.get(sku);
    const bidDepth = b?.depth ?? 0;
    const askDepth = a?.depth ?? 0;
    const spread = (a?.best && b?.best && a.best > 0)
      ? (a.best - b.best) / a.best
      : null;
    const tradesCount = t?.cnt ?? 0;
    const units = t?.units ?? 0;
    const daysSince = t?.days ?? null;

    // Composite scoring. Each component yields 0-1, then weighted sum.
    // Weights tuned for "what does an investor care about most" — exit
    // ability dominates (bid depth + recency), spread is a tiebreaker.
    const sBid    = Math.min(1, bidDepth / 10);                // 10 units of bid = full mark
    const sAsk    = Math.min(1, askDepth / 20);                // ask depth helps anchor price
    const sSpread = spread === null ? 0.4 : Math.max(0, 1 - spread / 0.30); // 30% spread = 0
    const sVol    = Math.min(1, tradesCount / 5);              // 5 trades/30d = full mark
    const sUnits  = Math.min(1, units / 20);
    const sRecent = daysSince === null ? 0
                  : daysSince <= 14 ? 1
                  : Math.max(0, 1 - (daysSince - 14) / 60);    // decay 14d → 74d

    const composite =
      sBid    * 0.30 +
      sRecent * 0.25 +
      sVol    * 0.15 +
      sUnits  * 0.10 +
      sAsk    * 0.10 +
      sSpread * 0.10;
    const score = Math.round(composite * 100);

    const flag: LiquidityScore["flag"] =
      score >= 70 ? "deep"
      : score >= 40 ? "ok"
      : daysSince !== null && daysSince > 60 ? "stale"
      : "thin";

    out.set(sku, {
      sku,
      score,
      bid_depth: bidDepth,
      ask_depth: askDepth,
      spread_pct: spread,
      trades_30d_count: tradesCount,
      units_30d: units,
      days_since_last_trade: daysSince,
      flag,
    });
  }
  return out;
}

// ── Concentration ──

export interface ConcentrationMetrics {
  /** Herfindahl-Hirschman Index on portfolio value (0-10000 scale). */
  hhi: number;
  /** Plain-English bucket. */
  bucket: "unconcentrated" | "moderate" | "concentrated";
  /** Largest single SKU as % of portfolio. */
  top_sku_pct: number;
  top_sku: string | null;
  /** Largest set as % of portfolio. */
  top_set_pct: number;
  top_set: string | null;
  /** Number of distinct SKUs needed to cover 50% of value. */
  positions_to_50pct: number;
}

export interface ValuedRow {
  sku: string;
  set_code: string | null;
  current_value: number;
}

export function concentration(rows: ValuedRow[]): ConcentrationMetrics {
  const total = rows.reduce((s, r) => s + r.current_value, 0);
  if (total <= 0) {
    return {
      hhi: 0,
      bucket: "unconcentrated",
      top_sku_pct: 0,
      top_sku: null,
      top_set_pct: 0,
      top_set: null,
      positions_to_50pct: 0,
    };
  }

  // HHI = sum of squared market shares (in percent points).
  const shares = rows.map((r) => ({ sku: r.sku, set_code: r.set_code, share: r.current_value / total }));
  const hhi = Math.round(shares.reduce((s, x) => s + Math.pow(x.share * 100, 2), 0));

  const sorted = [...shares].sort((a, b) => b.share - a.share);
  const topSku = sorted[0] ?? null;

  const setMap = new Map<string, number>();
  for (const r of rows) {
    const key = r.set_code ?? "(unknown)";
    setMap.set(key, (setMap.get(key) ?? 0) + r.current_value);
  }
  const setSorted = Array.from(setMap.entries())
    .map(([set_code, value]) => ({ set_code, share: value / total }))
    .sort((a, b) => b.share - a.share);
  const topSet = setSorted[0] ?? null;

  let cum = 0;
  let positionsTo50 = 0;
  for (const x of sorted) {
    cum += x.share;
    positionsTo50++;
    if (cum >= 0.5) break;
  }

  const bucket: ConcentrationMetrics["bucket"] =
    hhi < 1500 ? "unconcentrated"
    : hhi < 2500 ? "moderate"
    : "concentrated";

  return {
    hhi,
    bucket,
    top_sku_pct: topSku ? Math.round(topSku.share * 1000) / 10 : 0,
    top_sku: topSku?.sku ?? null,
    top_set_pct: topSet ? Math.round(topSet.share * 1000) / 10 : 0,
    top_set: topSet?.set_code ?? null,
    positions_to_50pct: positionsTo50,
  };
}
