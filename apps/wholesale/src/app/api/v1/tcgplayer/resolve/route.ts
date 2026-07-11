/**
 * GET /api/v1/tcgplayer/resolve
 *
 * Explicit blocked door. Stored upstream identifiers are TCGplayer content;
 * Cambridge does not publish or relicense the mapping without written scope.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../auth";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  return NextResponse.json(
    {
      source: "tcgplayer",
      status: "blocked",
      resolved: null,
      error: {
        code: "SOURCE_UNAVAILABLE",
        message:
          "TCGplayer identifier resolution is disabled. Cambridge has no " +
          "recorded written approval to publish these mappings.",
      },
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
