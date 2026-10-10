import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import {
  COMPLETED_TRADE_PUBLICATION,
  MARKET_INTEREST_PUBLICATION,
} from "@/lib/market/publication";

const LIMIT = 10;

// Only deliberate public order intent crosses this endpoint. Completed-trade,
// watch, and alert derivatives remain empty until their publication contracts
// and a reconstruction-resistant projector exist.
export async function GET() {
  const result = await query(
    `WITH eligible_orders AS (
       SELECT o.*
         FROM market_orders o
        WHERE NOT EXISTS (
          SELECT 1 FROM trust_profiles suspended
           WHERE suspended.user_id = o.user_id
             AND suspended.is_suspended = TRUE
        )
     ),
     card_meta AS (
       SELECT DISTINCT ON (sku) sku, card_name, image_url
         FROM eligible_orders
        WHERE card_name IS NOT NULL
          AND status IN ('open', 'partially_filled')
        ORDER BY sku, created_at DESC
     ),
     asks AS (
       SELECT sku, MIN(price)::numeric AS best_ask
         FROM eligible_orders
        WHERE side = 'ask' AND status IN ('open', 'partially_filled')
        GROUP BY sku
     ),
     bids AS (
       SELECT sku, MAX(price)::numeric AS best_bid
         FROM eligible_orders
        WHERE side = 'bid' AND status IN ('open', 'partially_filled')
        GROUP BY sku
     )
     SELECT b.sku, cm.card_name, cm.image_url, b.best_bid, a.best_ask
       FROM bids b
       JOIN asks a USING (sku)
       LEFT JOIN card_meta cm ON cm.sku = b.sku
      WHERE a.best_ask > b.best_bid
      ORDER BY (a.best_ask - b.best_bid) / NULLIF(a.best_ask, 0) ASC
      LIMIT ${LIMIT}`,
  );

  return NextResponse.json({
    publication: {
      completedTrades: COMPLETED_TRADE_PUBLICATION,
      marketInterest: MARKET_INTEREST_PUBLICATION,
    },
    hot: [],
    movers: [],
    mostWatched: [],
    tightSpreads: result.rows.map((row) => ({
      sku: row.sku,
      cardName: row.card_name,
      imageUrl: null,
      bestBid: row.best_bid !== null ? parseFloat(String(row.best_bid)) : null,
      bestAsk: row.best_ask !== null ? parseFloat(String(row.best_ask)) : null,
    })),
    dailyTradeAggregates: [],
  });
}
