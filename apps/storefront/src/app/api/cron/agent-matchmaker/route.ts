/**
 * Agent matchmaker cron — backstop for the opportunistic tick.
 *
 * `play.queue_match` already calls `tickMatchmaker` synchronously after
 * inserting the queue row, which handles the common case (an agent
 * joins a queue that already has a compatible partner). This cron
 * covers the missed case: an agent queues alone, then thirty seconds
 * later another agent queues, but a third agent's slow concurrent
 * insert raced past the first one. Re-tick periodically.
 *
 * Bearer-secret auth matches the main maintenance cron at
 * `apps/storefront/src/app/api/cron/maintenance/route.ts`.
 */

import { NextResponse } from "next/server";
import { tickMatchmaker } from "@/lib/agents/matchmaker";
import { requireCronAuth } from "@/lib/cron-auth";

export async function GET(request: Request) {
  const denied = requireCronAuth(request);
  if (denied) return denied;

  try {
    const result = await tickMatchmaker();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron] agent matchmaker failed:", err);
    const message = err instanceof Error ? err.message : "internal error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
