/**
 * GET /api/v1/tcgplayer/history/[sku]
 *
 * Explicit blocked door. No stored TCGplayer observation or identifier is
 * served until written approval covers Cambridge's exact use.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
): Promise<NextResponse> {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  const { sku } = await params;
  return NextResponse.json(
    {
      source: "tcgplayer",
      source_license: "proprietary",
      status: "blocked",
      sku,
      count: 0,
      observations: [],
      error: {
        code: "SOURCE_UNAVAILABLE",
        message:
          "TCGplayer data is unavailable. Cambridge has no recorded written " +
          "approval for its multi-source aggregation or redistribution use.",
      },
    },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
