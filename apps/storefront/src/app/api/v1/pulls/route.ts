/**
 * /api/v1/pulls — the pulls snapshot, machine-readable. Twin of /pulls.
 *
 * What a booster actually contains, per game: pack anatomy, rarity
 * ladders, approximate rates with basis + confidence on every row, and
 * rare occurrences (god packs, case hits, serialized cards) — plus the
 * disclosure map of which publishers officially publish odds at all.
 *
 * The dataset is our authored aggregation, released CC0; every rate
 * cites its own source inline. It contains no publisher-proprietary
 * substrate (no images, no verbatim card text) — figures and product
 * configurations are facts. Consumer information, never inducement:
 * no expected-value math ships here, by doctrine.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { PULLS_SNAPSHOT } from "@/lib/pulls/pull-rates";

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/pulls",
    sources: [
      "pull-rate research snapshot 2026-07-23 (authored aggregation; official disclosures + community box-break data, cited per row, adversarially verified)",
    ],
    source_license: ["cc0"],
    freshness: "catalog",
    as_of: PULLS_SNAPSHOT.asOf,
    data: {
      "@kind": "pulls_snapshot",
      as_of: PULLS_SNAPSHOT.asOf,
      provenance_note: PULLS_SNAPSHOT.provenanceNote,
      staleness_note:
        "Rates drift set to set and print wave to print wave. This is a dated snapshot re-verified on set releases and disclosure changes; where a publisher officially publishes odds, their page is always the authority.",
      disclosure_map: PULLS_SNAPSHOT.disclosureMap,
      games: PULLS_SNAPSHOT.games,
      key_sources: PULLS_SNAPSHOT.sources,
      _links: {
        canonical: "/api/v1/pulls",
        human_page: "/pulls",
        human_page_per_game: "/pulls/[game]",
        siblings: "/api/v1/status",
      },
    },
  });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
