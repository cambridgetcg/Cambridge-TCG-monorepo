import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — fair-value reference + optional bid-fill analysis.
//
// Query params:
//   bidPrice=X — optional. If passed, returns analysis of how likely this
//                bid is to fill based on the last 30d of trades.
//   windowDays — default 30, max 365.
//
// "Fair value" surfaces three numbers pulled from recent trades:
//   vwap   — volume-weighted average, weights each trade by quantity
//   median — less sensitive to outlier whales or cheap dumps
//   range  — min / max boundary of the window
//
// "Bid analysis" gives two concrete answers when the user is evaluating
// a price:
//   fillProbabilityPct  — fraction of trades in the window at ≤ bidPrice
//   expectedDaysToFill  — windowDays × totalTrades / matchesAtOrBelow
//
// Neither number is a promise (P2P volumes are bursty; market conditions
// shift), but both are grounded in actual trade history from this market.
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sku: string }> }
) {
  const { sku } = await params;
  const url = new URL(request.url);
  const windowDays = Math.min(Math.max(parseInt(url.searchParams.get("windowDays") || "30", 10) || 30, 1), 365);
  const bidPriceParam = url.searchParams.get("bidPrice");
  const bidPrice = bidPriceParam ? parseFloat(bidPriceParam) : null;

  const r = await query(
    `WITH w AS (
       SELECT price::numeric AS price, quantity
         FROM market_trades
        WHERE sku = $1
          AND escrow_status <> 'cancelled'
          AND created_at > NOW() - make_interval(days => $2)
     )
     SELECT
       COUNT(*)::int                                            AS trade_count,
       COALESCE(SUM(quantity), 0)::int                          AS total_volume,
       CASE WHEN SUM(quantity) > 0
            THEN SUM(price * quantity) / SUM(quantity)
       END::numeric                                             AS vwap,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY price)::numeric AS median,
       MIN(price)::numeric                                      AS price_min,
       MAX(price)::numeric                                      AS price_max,
       ${bidPrice !== null ? `
         COUNT(*) FILTER (WHERE price <= $3)::int               AS matches_below
       ` : `0::int AS matches_below`}
       FROM w`,
    bidPrice !== null ? [sku, windowDays, bidPrice] : [sku, windowDays]
  );
  const row = r.rows[0];
  const tradeCount = row.trade_count as number;

  const bidAnalysis = bidPrice !== null
    ? {
        bidPrice,
        // If no trades in window: probability undefined. Otherwise integer %.
        fillProbabilityPct: tradeCount > 0
          ? Math.round((row.matches_below / tradeCount) * 100)
          : null,
        // Expected days per match at this price level. null if no matches
        // in the window — can't extrapolate from zero.
        expectedDaysToFill: row.matches_below > 0
          ? Math.round((windowDays * tradeCount) / row.matches_below * 10) / 10
          : null,
      }
    : null;

  return NextResponse.json({
    sku,
    windowDays,
    fairValue: {
      vwap: row.vwap ? parseFloat(row.vwap) : null,
      median: row.median ? parseFloat(row.median) : null,
      tradeCount,
      totalVolume: row.total_volume as number,
      priceRange: {
        min: row.price_min ? parseFloat(row.price_min) : null,
        max: row.price_max ? parseFloat(row.price_max) : null,
      },
    },
    bidAnalysis,
  });
}
