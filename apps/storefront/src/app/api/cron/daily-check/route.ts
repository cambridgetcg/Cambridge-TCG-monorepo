/**
 * The daily check, at 08:40 UTC (vercel.json): after the night's collection
 * and the 07:00 derivation, and before the day. What it does, what it sends
 * and what it records is src/lib/observability/daily-check.ts. It answers
 * 503 only when a message was due and could not be sent; a fault it found
 * and reported is a check that worked.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";
import { runDailyCheck } from "@/lib/observability/daily-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// sec: the walk keeps to 75, the reads, the message and the record to 10 to 20 each.
export const maxDuration = 180;

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  const report = await runDailyCheck();
  return NextResponse.json(report, { status: report.ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
