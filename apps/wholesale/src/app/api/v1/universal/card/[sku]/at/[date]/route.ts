/**
 * /api/v1/universal/card/[sku]/at/[date]
 *
 * The temporal source is price_archive, whose stored rows have no cleared
 * publication source today. This route returns policy status and performs no
 * archive or card read.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../../../../auth";

export async function GET(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  return NextResponse.json(
    {
      ok: false,
      status: "publication_withheld_pending_field_level_rights",
      price: null,
      note: "No price_archive source is currently cleared for publication.",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
