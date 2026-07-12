/**
 * TCGCollector discovery cron — disabled pending written partner approval.
 *
 * Authentication still runs first, so the route does not disclose internal
 * operations to unauthorised callers. An authorised call receives the stable
 * blocked verdict. No runner, database or network module is imported.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

export const maxDuration = 30;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "SOURCE_BLOCKED",
        message:
          "TCGCollector is blocked/no-fetch until written partner approval records the exact access, storage, display, image, deletion and redistribution terms.",
      },
      network_requests: 0,
      database_writes: 0,
    },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}

export const GET = POST;
