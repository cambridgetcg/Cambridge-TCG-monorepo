import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — admin: tier roster.
// For each tier in the system: how many users + total/avg annual_spend in
// that tier, plus subscription counts for paid tiers. Useful for sizing
// promotions and seeing who's at risk of dropping a tier.
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const r = await query(
    `SELECT
       t.id, t.name, t.icon, t.color, t.sort_order,
       t.min_annual_spend::numeric AS min_spend,
       t.is_paid,
       t.cashback_percent::numeric         AS cashback,
       t.points_multiplier::numeric        AS points_x,
       t.tradein_bonus_percent::numeric    AS tradein_bonus,
       t.p2p_commission_rate::numeric      AS p2p_rate,
       t.auction_commission_rate::numeric  AS auction_rate,
       t.auction_priority_approval         AS priority,
       t.store_discount_percent::numeric   AS store_discount,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id)::int                                            AS user_count,
       COALESCE(SUM(u.annual_spend::numeric) FILTER (WHERE u.tier_id = t.id), 0)::numeric          AS total_annual_spend,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'subscription')::int         AS subscription_count,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'manual')::int               AS manual_count,
       COUNT(u.id) FILTER (WHERE u.tier_id = t.id AND u.tier_source = 'spending')::int             AS spending_count
       FROM tiers t
       LEFT JOIN users u ON u.tier_id = t.id
      GROUP BY t.id
      ORDER BY t.sort_order ASC`
  );

  return NextResponse.json({
    tiers: r.rows.map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      color: row.color,
      isPaid: row.is_paid,
      minSpend: parseFloat(row.min_spend),
      perks: {
        cashbackPct: parseFloat(row.cashback ?? "0"),
        pointsMultiplier: parseFloat(row.points_x ?? "1"),
        tradeinBonusPct: parseFloat(row.tradein_bonus ?? "0"),
        p2pRate: row.p2p_rate ? parseFloat(row.p2p_rate) : null,
        auctionRate: row.auction_rate ? parseFloat(row.auction_rate) : null,
        priorityApproval: row.priority === true,
        storeDiscountPct: parseFloat(row.store_discount ?? "0"),
      },
      userCount: row.user_count,
      totalAnnualSpend: parseFloat(row.total_annual_spend),
      avgAnnualSpend: row.user_count > 0
        ? parseFloat(row.total_annual_spend) / row.user_count
        : 0,
      sourceBreakdown: {
        subscription: row.subscription_count,
        manual: row.manual_count,
        spending: row.spending_count,
      },
    })),
  });
}
