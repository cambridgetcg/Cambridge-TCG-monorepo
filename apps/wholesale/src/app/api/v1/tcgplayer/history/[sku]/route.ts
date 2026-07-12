/**
 * GET /api/v1/tcgplayer/history/[sku]
 *
 * TCGplayer observations are contract-only. An API key authenticates a
 * Cambridge caller; it does not prove that the caller is covered by the
 * upstream agreement. Keep this route value-free until per-key contract
 * entitlements exist.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../../auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  const { sku } = await params;
  return NextResponse.json(
    {
      sku,
      source: "tcgplayer",
      source_license: "internal-only",
      status: "unavailable_source_rights",
      reason:
        "TCGplayer data is contract-only. A Cambridge API key is not evidence that this caller may receive or republish the observations.",
      observations: [],
      does_not_include: [
        "prices",
        "currency conversions",
        "spreads",
        "source URLs",
        "upstream product or SKU identifiers",
        "counts or aggregates derived from restricted observations",
      ],
    },
    {
      headers: {
        "Cache-Control": "private, no-store",
        "X-Content-License": "NOASSERTION",
      },
    },
  );
}
