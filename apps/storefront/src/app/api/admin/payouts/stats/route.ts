import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — aggregate stats over the last N days (default 7).
// Returns: paid count, paid total, commission earned, avg turnaround (completed→paid).
export async function GET(request: Request) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") || "7", 10) || 7, 1), 365);

  // Unified stats over trades + auctions in the window
  const r = await query(
    `WITH paid_trades AS (
       SELECT seller_payout::numeric AS payout,
              commission_amount::numeric AS commission,
              EXTRACT(EPOCH FROM (seller_paid_at - completed_at)) AS secs
         FROM market_trades
        WHERE seller_paid_at IS NOT NULL
          AND seller_paid_at > NOW() - make_interval(days => $1)
     ),
     paid_auctions AS (
       SELECT seller_payout::numeric AS payout,
              (current_price::numeric - seller_payout::numeric) AS commission,
              EXTRACT(EPOCH FROM (seller_paid_at - paid_at)) AS secs
         FROM auctions
        WHERE seller_paid_at IS NOT NULL
          AND seller_paid_at > NOW() - make_interval(days => $1)
          AND seller_user_id IS NOT NULL
     ),
     combined AS (
       SELECT * FROM paid_trades UNION ALL SELECT * FROM paid_auctions
     )
     SELECT
       COUNT(*)                                AS paid_count,
       COALESCE(SUM(payout), 0)                AS paid_total,
       COALESCE(SUM(commission), 0)            AS commission_total,
       COALESCE(AVG(secs), 0)                  AS avg_turnaround_secs,
       (SELECT COUNT(*) FROM paid_trades)      AS trade_count,
       (SELECT COUNT(*) FROM paid_auctions)    AS auction_count
       FROM combined`,
    [days]
  );

  const row = r.rows[0];
  return NextResponse.json({
    windowDays: days,
    paidCount: parseInt(row.paid_count, 10),
    tradeCount: parseInt(row.trade_count, 10),
    auctionCount: parseInt(row.auction_count, 10),
    paidTotalGbp: parseFloat(row.paid_total),
    commissionTotalGbp: parseFloat(row.commission_total),
    avgTurnaroundHours: parseFloat(row.avg_turnaround_secs) / 3600,
  });
}
