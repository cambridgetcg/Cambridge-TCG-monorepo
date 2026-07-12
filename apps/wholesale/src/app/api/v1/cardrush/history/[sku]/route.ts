/**
 * GET /api/v1/cardrush/history/[sku]
 *
 * Legacy CardRush observations remain stored for rights review. Authentication
 * or a downstream contract does not create upstream publication permission, so
 * this route returns policy status and never reads the archive.
 */

import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "../../../auth";
import {
  CARDRUSH_BLOCK_REASON,
  CARDRUSH_DATA_POLICY_URL,
} from "@cambridge-tcg/data-ingest";

export async function GET(req: NextRequest) {
  const apiKey = await authenticateApiKey(req);
  if (apiKey instanceof NextResponse) return apiKey;

  return NextResponse.json(
    {
      ok: false,
      status: "publication_withheld_pending_written_rights",
      source: "cardrush",
      reason: CARDRUSH_BLOCK_REASON,
      policy: CARDRUSH_DATA_POLICY_URL,
      observations: [],
    },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}
