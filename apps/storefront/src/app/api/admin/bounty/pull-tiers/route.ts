import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/admin/auth";
import { query } from "@/lib/db";

// GET — list all tiers with their config, plus usage stats for the last 7 days
// and a count of reserved vault items per tier (inventory exposure).
export async function GET() {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const tiers = await query(
      `SELECT
         t.tier, t.display_name, t.target_ev_pence, t.weekly_global_cap,
         t.rarity_weights, t.enabled, t.updated_at,
         (
           SELECT COUNT(*)::int FROM bounty_pulls p
           WHERE p.tier = t.tier AND p.resolved_at >= NOW() - INTERVAL '7 days'
         ) AS pulls_this_week,
         (
           SELECT COUNT(*)::int FROM bounty_pull_tokens k
           WHERE k.tier = t.tier AND k.count > 0
         ) AS unresolved_token_holders,
         (
           SELECT COALESCE(SUM(k.count), 0)::int FROM bounty_pull_tokens k
           WHERE k.tier = t.tier
         ) AS outstanding_tokens
       FROM bounty_pull_tiers t
       ORDER BY t.target_ev_pence ASC`,
    );

    const exposure = await query(
      `SELECT COALESCE(SUM(spot_price_gbp), 0)::numeric AS reserved_gbp,
              COUNT(*)::int AS reserved_count
       FROM vault_items WHERE status = 'reserved'`,
    );

    return NextResponse.json({
      tiers: tiers.rows,
      exposure: {
        reservedCount: exposure.rows[0].reserved_count,
        reservedGbp: parseFloat(exposure.rows[0].reserved_gbp),
      },
    });
  } catch (err) {
    console.error("[admin/bounty/pull-tiers] list failed", err);
    return NextResponse.json({ error: "Database error." }, { status: 500 });
  }
}
