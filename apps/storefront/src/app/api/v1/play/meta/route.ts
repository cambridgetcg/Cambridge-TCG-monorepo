/**
 * /api/v1/play/meta — the competitive-meta snapshot, machine-readable.
 * A dated photograph of a moving river: as_of + data_window + sources on
 * every response, tier claims grounded in cited tournament results,
 * decklists linked at their publishers. Twin of /play/meta.
 */

import { NextResponse } from "next/server";
import { META_SNAPSHOT } from "@/lib/play/meta-snapshot";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Cache-Control": "public, max-age=3600",
} as const;

export async function GET() {
  return NextResponse.json(
    {
      "@kind": "meta_snapshot",
      as_of: META_SNAPSHOT.asOf,
      data_window: META_SNAPSHOT.dataWindow,
      latest_set: META_SNAPSHOT.latestSet,
      format_context: META_SNAPSHOT.formatContext,
      staleness_note:
        "Metagames move weekly. This is a dated snapshot re-verified on set releases and restriction news; the cited sources are live and authoritative.",
      tiers: META_SNAPSHOT.tiers,
      recent_results: META_SNAPSHOT.recentResults,
      official_circuit: META_SNAPSHOT.officialCircuit,
      community_circuit: META_SNAPSHOT.communityCircuit,
      sources: META_SNAPSHOT.sources,
      _links: {
        canonical: "/api/v1/play/meta",
        human_page: "/play/meta",
        banlist: "/api/v1/play/banlist",
        siblings: "/api/v1/play/index.json",
      },
    },
    { headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Max-Age": "86400" },
  });
}
