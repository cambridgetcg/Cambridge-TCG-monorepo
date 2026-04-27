import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { query } from "@/lib/db";

// Last-90-day trust score history for the requester. Reads from
// trust_score_history populated by the daily recompute cron — not a
// live recompute, so this is cheap to call frequently from the
// dashboard sparkline.

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const r = await query(
    `SELECT snapshot_date, trust_score, total_trades, completed_trades,
            disputes_won, disputes_lost, avg_rating
       FROM trust_score_history
      WHERE user_id = $1
        AND snapshot_date >= CURRENT_DATE - INTERVAL '90 days'
      ORDER BY snapshot_date ASC`,
    [session.user.id],
  );

  return NextResponse.json({ history: r.rows });
}
