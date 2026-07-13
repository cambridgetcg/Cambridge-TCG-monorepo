/**
 * GET /api/v1/prices
 *
 * The stored catalog's price, price rank, channel-price, and image fields have
 * legacy CardRush lineage. Authentication and transformation do not create
 * publication permission, so the route fails closed before auth or database
 * access. A future structural catalog needs field-level source receipts.
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
      total: 0,
      count: 0,
      items: [],
    },
    {
      status: 503,
      headers: { "Cache-Control": INTERNAL_ONLY_CACHE_CONTROL },
    },
  );
}
