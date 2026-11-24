import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";
import { completedButNotOwedTradeSql, owedAuctionSql, owedTradeSql } from "@/lib/payouts/owed";

// GET — payouts owed but not yet sent, by the one rule in lib/payouts/owed.ts:
// the buyer's payment is recorded, the sale reached its end, and the seller
// has not been paid out. Each row carries the seller's Connect status so admin
// can see at a glance whether auto-payout can even run for this row.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Trades
  const tradeRows = await query(
    `SELECT 'trade' AS kind, t.id, t.completed_at AS eligible_at,
            t.seller_payout::numeric AS amount,
            t.payout_hold_days,
            COALESCE(o.card_name, t.sku) AS label,
            t.seller_id, su.email AS seller_email, su.name AS seller_name,
            su.stripe_connect_account_id IS NOT NULL AS has_connect,
            su.stripe_connect_payouts_enabled AS connect_ready,
            su.stripe_connect_status AS connect_status,
            (t.completed_at + make_interval(days => COALESCE(t.payout_hold_days, 0))) AS available_at
       FROM market_trades t
       JOIN users su ON su.id = t.seller_id
       LEFT JOIN market_orders o ON o.id = t.bid_order_id
      WHERE ${owedTradeSql("t")}`
  );

  // Auctions (with a seller). Uses platform-default 3-day hold
  // to match the cron sweep.
  const auctionRows = await query(
    `SELECT 'auction' AS kind, a.id, a.paid_at AS eligible_at,
            a.seller_payout::numeric AS amount,
            3 AS payout_hold_days,
            a.title AS label,
            a.seller_user_id AS seller_id, su.email AS seller_email, su.name AS seller_name,
            su.stripe_connect_account_id IS NOT NULL AS has_connect,
            su.stripe_connect_payouts_enabled AS connect_ready,
            su.stripe_connect_status AS connect_status,
            (a.paid_at + make_interval(days => 3)) AS available_at
       FROM auctions a
       JOIN users su ON su.id = a.seller_user_id
      WHERE ${owedAuctionSql("a")}`
  );

  // Completed trades the list leaves out, because no buyer payment (or no
  // completion time) is recorded. Counted, so the operator still hears of them.
  const notOwed = await query(
    `SELECT COUNT(*)::int AS n FROM market_trades t WHERE ${completedButNotOwedTradeSql("t")}`
  );

  const now = Date.now();
  const rows = [...tradeRows.rows, ...auctionRows.rows].map((r) => ({
    ...r,
    dueNow: r.available_at ? new Date(r.available_at).getTime() <= now : true,
  }));

  // Sort: past-due first, then by available_at ascending
  rows.sort((a, b) => {
    if (a.dueNow !== b.dueNow) return a.dueNow ? -1 : 1;
    return new Date(a.available_at).getTime() - new Date(b.available_at).getTime();
  });

  const totalOwedGbp = rows.reduce((s, r) => s + parseFloat(r.amount), 0);
  const overdueCount = rows.filter((r) => r.dueNow).length;

  return NextResponse.json({
    rows,
    totalOwedGbp,
    overdueCount,
    completedNotOwedCount: notOwed.rows[0].n,
  });
}
