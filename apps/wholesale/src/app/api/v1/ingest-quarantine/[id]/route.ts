/**
 * Quarantine detail and mutation are unavailable through partner bearer keys.
 * Rows may contain raw upstream payloads, and partner authentication is not an
 * operator authorization boundary.
 */

import { NextResponse } from "next/server";
import { INTERNAL_ONLY_CACHE_CONTROL } from "@/lib/source-publication-policy";

function unavailable() {
  return NextResponse.json(
    {
      status: "unavailable",
      access_status: "blocked",
      reason:
        "Raw quarantine payloads and review mutations require a separate operator-only authorization surface that is not implemented.",
    },
    {
      status: 503,
      headers: { "Cache-Control": INTERNAL_ONLY_CACHE_CONTROL },
    },
  );
}

export async function GET() {
  return unavailable();
}

export async function PATCH() {
  return unavailable();
}
