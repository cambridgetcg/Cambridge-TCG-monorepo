/**
 * POST /api/cron/ingest/tcgplayer
 *
 * Explicit blocked door. The earlier catalog/pricing dispatcher is retained
 * in git history, but no request may reach it while Cambridge lacks written
 * approval for its multi-source use. Authentication still runs first; a
 * credential for Cambridge's cron is not permission from TCGplayer.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  return NextResponse.json(
    {
      ok: false,
      source: "tcgplayer",
      status: "blocked",
      error: {
        code: "SOURCE_UNAVAILABLE",
        message:
          "TCGplayer acquisition is disabled. Cambridge has no recorded written " +
          "approval for its multi-source aggregation or redistribution use; " +
          "credentials do not change that boundary.",
      },
      network_request_made: false,
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
