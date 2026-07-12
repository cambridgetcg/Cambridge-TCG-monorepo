/**
 * GET /api/v1/prices/[sku]
 *
 * Closed for the same field-level source-rights reason as the collection
 * endpoint. The response is status-only and never authenticates or reads a
 * card row.
 */

import { NextResponse } from "next/server";
import { INTERNAL_ONLY_CACHE_CONTROL } from "@/lib/source-publication-policy";

export async function GET() {
  return NextResponse.json(
    {
      status: "unavailable",
      publication_status: "blocked",
      source: "legacy-wholesale-catalog",
      policy_url: "https://cardrush.media/data_policy",
      reason:
        "No field-level receipt separates independently publishable catalog fields from legacy CardRush-derived prices and images.",
    },
    {
      status: 503,
      headers: { "Cache-Control": INTERNAL_ONLY_CACHE_CONTROL },
    },
  );
}
