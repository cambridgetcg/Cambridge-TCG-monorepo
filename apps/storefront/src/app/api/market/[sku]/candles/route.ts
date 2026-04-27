import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — OHLC candles + recent trades series for a single SKU.
// Query: interval = 1h | 4h | 1d (default 1d), limit = <= 200 (default 60).
// Excludes cancelled trades so disputes that refunded don't pollute the feed.
//
// Also returns: last_price, 24h change percent, and a simple sparkline
// (recent close prices) so the client can render without further roundtrips.

const INTERVAL_TO_TRUNC: Record<string, string> = {
  "1h": "hour",
  "4h": "hour",    // we bucket 4h manually from hour-truncated below
  "1d": "day",
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const url = new URL(request.url);
  const interval = (url.searchParams.get("interval") || "1d").toLowerCase();
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "60", 10) || 60, 1), 200);

  const trunc = INTERVAL_TO_TRUNC[interval];
  if (!trunc) {
    return NextResponse.json(
      { error: "interval must be one of: 1h, 4h, 1d" },
      { status: 400 }
    );
  }

  // Window of trades to consider. Enough history to fill `limit` buckets at
  // the chosen interval, plus a small margin.
  const windowHours = interval === "1h" ? limit + 4
                    : interval === "4h" ? limit * 4 + 16
                    : /* 1d */            limit * 24 + 24;

  // 4h buckets: truncate to hour, then subtract the hour-within-4h offset.
  const bucketExpr = interval === "4h"
    ? `date_trunc('hour', created_at) - make_interval(hours => MOD(EXTRACT(HOUR FROM created_at)::int, 4))`
    : `date_trunc($1, created_at)`;
  const bucketParams: unknown[] = interval === "4h" ? [] : [trunc];

  const paramBase = bucketParams.length;
  const ohlcSql = `
    WITH bucketed AS (
      SELECT ${bucketExpr} AS bucket,
             price::numeric AS price,
             quantity,
             ROW_NUMBER() OVER (PARTITION BY ${bucketExpr} ORDER BY created_at ASC)  AS rn_asc,
             ROW_NUMBER() OVER (PARTITION BY ${bucketExpr} ORDER BY created_at DESC) AS rn_desc
        FROM market_trades
       WHERE sku = $${paramBase + 1}
         AND escrow_status <> 'cancelled'
         AND created_at > NOW() - make_interval(hours => $${paramBase + 2})
    )
    SELECT bucket,
           MAX(CASE WHEN rn_asc  = 1 THEN price END) AS open,
           MAX(price) AS high,
           MIN(price) AS low,
           MAX(CASE WHEN rn_desc = 1 THEN price END) AS close,
           SUM(quantity) AS volume
      FROM bucketed
     GROUP BY bucket
     ORDER BY bucket DESC
     LIMIT $${paramBase + 3}
  `;
  const ohlcRes = await query(ohlcSql, [...bucketParams, sku, windowHours, limit]);

  const candles = ohlcRes.rows
    .map((r) => ({
      t: r.bucket,
      o: parseFloat(r.open),
      h: parseFloat(r.high),
      l: parseFloat(r.low),
      c: parseFloat(r.close),
      v: parseInt(r.volume, 10),
    }))
    .reverse(); // ASC order for plotting

  // 24h change: compare last trade to the most recent trade >= 24h ago.
  const changeRes = await query(
    `SELECT
       (SELECT price::numeric FROM market_trades
         WHERE sku = $1 AND escrow_status <> 'cancelled'
         ORDER BY created_at DESC LIMIT 1) AS last_price,
       (SELECT price::numeric FROM market_trades
         WHERE sku = $1 AND escrow_status <> 'cancelled'
           AND created_at <= NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 1) AS price_24h_ago`,
    [sku]
  );
  const lastPrice = changeRes.rows[0]?.last_price ? parseFloat(changeRes.rows[0].last_price) : null;
  const prior = changeRes.rows[0]?.price_24h_ago ? parseFloat(changeRes.rows[0].price_24h_ago) : null;
  const change24hPct =
    lastPrice !== null && prior !== null && prior > 0
      ? ((lastPrice - prior) / prior) * 100
      : null;

  return NextResponse.json({
    sku,
    interval,
    candles,
    lastPrice,
    change24hPct,
    // Sparkline: closes from the last N buckets — whatever `limit` yielded
    sparkline: candles.map((c) => c.c),
  });
}
