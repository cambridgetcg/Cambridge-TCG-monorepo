/**
 * GET /api/v1/prices/[sku]/sources
 *
 * Stored source rows are not publication permission. No price source is
 * currently cleared, so authenticated callers receive policy status and zero
 * rows without an archive read.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../../auth";

export async function GET(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  return NextResponse.json(
    {
      ok: false,
      status: "publication_withheld_pending_field_level_rights",
      prices: [],
      count: 0,
      agreement: null,
      note: "No stored source row is currently cleared for publication.",
    },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
