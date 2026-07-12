/**
 * Bandai EN ingestion is paused.
 *
 * The parser remains available for offline review, but Cambridge has no
 * documented permission to collect Bandai's proprietary card text and images
 * into this service. This route must stay inert until that permission and a
 * reviewed storage/publication rule are recorded.
 *
 * Both methods return before reading authentication, request parameters, the
 * network, or the database. Keeping the boundary ahead of auth also prevents a
 * valid operator credential from being mistaken for upstream permission.
 */

import { NextResponse } from "next/server";

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

export function POST(): NextResponse {
  return pausedResponse();
}

export function GET(): NextResponse {
  return pausedResponse();
}
