/**
 * GET /api/cron/price-snapshot
 *
 * Vercel cron handler — runs daily at 02:00 UTC (see vercel.json).
 * Auth: Authorization: Bearer {CRON_SECRET}
 */

import { NextRequest, NextResponse } from "next/server";
import { runDailySnapshot } from "@/lib/price-snapshot";
import { requireCronAuth } from "@/lib/cron-auth";
import { redactInternalError } from "@/lib/public-errors";
import {
  CARDRUSH_ACQUISITION_ENABLED,
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

export const maxDuration = 300; // 5 min Vercel function timeout

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  if (!CARDRUSH_ACQUISITION_ENABLED) {
    return NextResponse.json(
      { ok: false, status: "blocked_pending_formal_partnership", reason: CARDRUSH_BLOCK_REASON, policy: CARDRUSH_DATA_POLICY_URL },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const startTs = new Date().toISOString();
  console.log(`[price-snapshot] Starting daily snapshot at ${startTs}`);

  try {
    const result = await runDailySnapshot();

    const endTs = new Date().toISOString();
    console.log(`[price-snapshot] Completed at ${endTs}`, result);

    return NextResponse.json({ ok: true, startTs, endTs, ...result });
  } catch (err) {
    const error = redactInternalError("cron/price-snapshot", err);
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
