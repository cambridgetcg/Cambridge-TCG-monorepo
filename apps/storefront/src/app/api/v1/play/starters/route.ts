import { jsonResponse } from "@/lib/data-pantry";

/** Rights-gapped collection. An empty array here means withheld, not empty. */
export async function GET(): Promise<Response> {
  return jsonResponse({
    data: {
      "@kind": "starter_deck_catalog_gap",
      publication_status: "withheld-untraced-lineage",
      catalog_membership_included: false,
      collection_complete: false,
      count: null,
      starters: [],
      withheld_fields: [
        "starter products, names, leaders, colors, and playstyle descriptions",
        "decklist composition and card numbers",
        "source URLs and resolved wholesale card metadata",
      ],
      withheld_reason:
        "the static reference includes upstream product/decklist facts and the resolver uses an internal-only wholesale mirror; neither has affirmative field-level public lineage",
    },
    endpoint: "/api/v1/play/starters",
    sources: ["starter-decks.upstream-reference"],
    source_license: ["internal-only"],
    license: "NOASSERTION",
    freshness: "methodology",
    no_cache: true,
    does_not_include: [
      "catalog membership or starter identities",
      "card numbers, SKUs, names, images, rarity, prices, or stock",
    ],
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
