/**
 * GET /api/v1/prices/movers
 *
 * The historical implementation derived movements from CardRush archive
 * rows. A percentage or channel-price transformation does not create
 * downstream publication rights, so this route fails closed before auth,
 * database access, or archive reads.
 */

import { NextResponse } from "next/server";
import { INTERNAL_ONLY_CACHE_CONTROL } from "@/lib/source-publication-policy";

export async function GET() {
  return NextResponse.json(
    {
      status: "unavailable",
      publication_status: "blocked",
      source: "cardrush",
      policy_url: "https://cardrush.media/data_policy",
      reason:
        "CardRush requires a formal partnership for automated collection. No written partnership or downstream publication permission is recorded, and derived movements retain that source lineage.",
      count: 0,
      movers: [],
    },
    {
      status: 503,
      headers: { "Cache-Control": INTERNAL_ONLY_CACHE_CONTROL },
    },
  );
}
