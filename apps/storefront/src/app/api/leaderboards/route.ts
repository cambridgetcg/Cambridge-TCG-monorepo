import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// GET — anonymous completed-market activity. Person-level buyer and seller
// rankings are withheld: a public profile is not permission to publish
// someone's purchases, sales or gross transaction volume as a competition.
const LIMIT = 10;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const days = Math.min(
    Math.max(parseInt(url.searchParams.get("days") || "30", 10) || 30, 1),
    365,
  );

  const skusRes = await query(
    `WITH agg AS (
       SELECT t.sku,
              COUNT(*)::int                  AS trade_count,
              SUM(t.quantity)::int           AS volume,
              AVG(t.price::numeric)::numeric AS avg_price
         FROM market_trades t
        WHERE t.escrow_status = 'completed'
          AND t.completed_at > NOW() - make_interval(days => $1)
        GROUP BY t.sku
        ORDER BY trade_count DESC
        LIMIT $2
     ),
     card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name, image_url
         FROM market_orders
        WHERE card_name IS NOT NULL
        ORDER BY sku, created_at DESC
     )
     SELECT a.sku, a.trade_count, a.volume, a.avg_price,
            cm.card_name, cm.image_url
       FROM agg a
       LEFT JOIN card_meta cm ON cm.sku = a.sku`,
    [days, LIMIT],
  );

  return NextResponse.json({
    windowDays: days,
    topSellers: [],
    topBuyers: [],
    personBoards: {
      status: "withheld",
      reason:
        "A public profile does not grant permission to rank personal buying, selling or gross transaction volume.",
    },
    busiestSkus: skusRes.rows.map((row) => ({
      sku: row.sku,
      cardName: null,
      imageUrl: null,
      tradeCount: row.trade_count,
      volume: row.volume,
      avgPrice: parseFloat(row.avg_price),
    })),
  }, {
    headers: {
      "Cache-Control": "private, no-store",
      "X-Data-License": "NOASSERTION",
    },
  });
}
