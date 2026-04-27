/**
 * GET /api/cron/price-snapshot
 *
 * Vercel cron handler — runs daily at 02:00 UTC (see vercel.json).
 * Auth: Authorization: Bearer {CRON_SECRET}  OR  ?secret={CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { runDailySnapshot } from "@/lib/price-snapshot";

export const maxDuration = 300; // 5 min Vercel function timeout

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && secret !== cronSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTs = new Date().toISOString();
  console.log(`[price-snapshot] Starting daily snapshot at ${startTs}`);

  try {
    const result = await runDailySnapshot();

    const endTs = new Date().toISOString();
    console.log(`[price-snapshot] Completed at ${endTs}`, result);

    return NextResponse.json({ ok: true, startTs, endTs, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[price-snapshot] Failed:", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
