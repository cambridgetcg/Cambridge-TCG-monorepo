import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — cards with high buyer demand (watch count + alert count) relative
// to current ask depth. The higher the demand-to-supply ratio, the more
// likely a seller can list and clear quickly.
//
// Useful both for sellers deciding what to list (public page) and for
// internal merchandising — surfaces demand our P2P flywheel hasn't yet
// caught up to.
//
// Query params:
//   limit   — rows to return (default 40, max 200)
//   minWatches — minimum watch count to qualify (default 1)
export async function GET(request: Request) {
  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "40", 10) || 40, 1), 200);
  const minWatches = Math.max(parseInt(url.searchParams.get("minWatches") || "1", 10) || 1, 1);

  // Aggregate per-sku: watches, alerts with direction='below', current
  // best_ask + ask_depth, last trade price, card metadata.
  const r = await query(
    `WITH watch_agg AS (
       SELECT sku, COUNT(*)::int AS watch_count
         FROM market_watches
        GROUP BY sku
     ),
     alert_agg AS (
       SELECT sku, COUNT(*) FILTER (WHERE direction = 'below' AND active) ::int AS alert_count
         FROM price_alerts
        GROUP BY sku
     ),
     asks AS (
       SELECT sku,
              MIN(price)::numeric                                         AS best_ask,
              SUM(quantity - filled_quantity)::int                        AS ask_depth
         FROM market_orders
        WHERE side = 'ask' AND status IN ('open','partially_filled')
        GROUP BY sku
     ),
     last_trade AS (
       SELECT DISTINCT ON (sku) sku, price::numeric AS last_trade_price, created_at
         FROM market_trades
        WHERE escrow_status <> 'cancelled'
        ORDER BY sku, created_at DESC
     ),
     card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name, image_url, set_code
         FROM market_orders
        WHERE card_name IS NOT NULL
        ORDER BY sku, created_at DESC
     )
     SELECT w.sku,
            w.watch_count,
            COALESCE(a.alert_count, 0)           AS alert_count,
            COALESCE(asks.ask_depth, 0)          AS ask_depth,
            asks.best_ask,
            lt.last_trade_price,
            cm.card_name, cm.image_url, cm.set_code
       FROM watch_agg w
       LEFT JOIN alert_agg  a    ON a.sku = w.sku
       LEFT JOIN asks            ON asks.sku = w.sku
       LEFT JOIN last_trade lt   ON lt.sku = w.sku
       LEFT JOIN card_meta  cm   ON cm.sku = w.sku
      WHERE w.watch_count >= $1
      ORDER BY (w.watch_count + COALESCE(a.alert_count, 0) * 2) DESC,
               asks.ask_depth ASC NULLS FIRST
      LIMIT $2`,
    [minWatches, limit]
  );

  const rows = r.rows.map((row) => {
    const watches = row.watch_count as number;
    const alerts = row.alert_count as number;
    const askDepth = row.ask_depth as number;
    // Opportunity score — higher when demand exceeds supply. Alerts
    // weight double since they're a stronger signal than a passive watch.
    const demandScore = watches + alerts * 2;
    const opportunity = askDepth > 0 ? demandScore / askDepth : demandScore * 2;
    return {
      sku: row.sku,
      cardName: row.card_name,
      imageUrl: row.image_url,
      setCode: row.set_code,
      watchCount: watches,
      alertCount: alerts,
      askDepth,
      bestAsk: row.best_ask ? parseFloat(row.best_ask) : null,
      lastTradePrice: row.last_trade_price ? parseFloat(row.last_trade_price) : null,
      demandScore,
      opportunityScore: Math.round(opportunity * 10) / 10,
    };
  });

  return NextResponse.json({ rows });
}
