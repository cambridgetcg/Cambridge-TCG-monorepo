/**
 * Bandai EN ingestion is paused.
 *
 * The parser remains available for offline review, but Cambridge has no
 * documented permission to collect Bandai's proprietary card text and images
 * into this service. This route must stay inert until that permission and a
 * reviewed storage/publication rule are recorded.
 *
 * Both methods require the normal cron secret, then return before reading
 * request parameters, the network, or the database. Authentication authorizes
 * the request only; a valid operator credential never creates upstream
 * collection or publication permission.
 */

import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/cron-auth";

function pausedResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: "PUBLICATION_PAUSED",
        message:
          "Bandai EN ingestion is paused because Cambridge has no documented permission to collect or publish this proprietary source.",
      },
      publication_status: "paused_pending_documented_source_permission",
      records_read: 0,
      records_written: 0,
    },
    {
      status: 503,
      headers: {
        "Cache-Control": "private, no-store",
        "Retry-After": "86400",
      },
    },
  );
}

export function POST(request: Request): NextResponse {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  return pausedResponse();
}

export function GET(request: Request): NextResponse {
  const denied = requireCronAuth(request);
  if (denied) return denied;
  return pausedResponse();
}
