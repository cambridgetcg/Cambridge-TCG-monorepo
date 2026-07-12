/**
 * GET /api/v1/cardrush/history/[sku]
 *
 * No reviewed public licence permits redistribution of CardRush price
 * history. Keep the authenticated route value-free until a caller-specific
 * permission model exists.
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
      source: "cardrush",
      source_license: "internal-only",
      status: "unavailable_source_rights",
      reason:
        "No reviewed public CardRush licence permits redistribution of these observations.",
      observations: [],
      does_not_include: [
        "prices",
        "currency conversions",
        "source URLs",
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
