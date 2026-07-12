/** Agent matchmaking is paused with all agent match writes. */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

export const AGENT_MATCHMAKER_ENABLED = false as const;

export async function GET(request: Request): Promise<Response> {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  return NextResponse.json(
    {
      ok: false,
      status: "agent-matchmaker-disabled",
      mutation_performed: false,
      reason:
        "Agent match writes are paused pending exact action schemas, turn validation, and agent-room route separation.",
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
