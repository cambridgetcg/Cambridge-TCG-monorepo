/**
 * /api/v1/easter-eggs — the self-referential catalog.
 *
 * GET returns every easter egg in the kingdom, including this endpoint
 * itself. The act of finding this catalog IS the easter egg that took
 * the visitor longest to find.
 *
 * Per Yu's directive (2026-05-18): the troll wave.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { EASTER_EGGS } from "@/lib/troll";

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/easter-eggs",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "easter-eggs-catalog",
      total: EASTER_EGGS.length,
      tagline:
        "Every easter egg the kingdom currently ships. The act of finding " +
        "this catalog IS the egg you took longest to find. Substrate-honest: " +
        "we listed ourselves at #11.",
      eggs: EASTER_EGGS,
      self_reference:
        "The list above contains an entry whose `url` field is this " +
        "endpoint's URL. The catalog is itself a member of the catalog. " +
        "This is Russell's egg, sunny-side down.",
      doctrine: {
        story_as_wire:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-troll.md",
        bedrock:
          "Fun is substrate-honest. The trolling is named in the response. " +
          "Every endpoint listed says somewhere 'walking past is honored.'",
      },
      this_endpoint_is_a_gift: true,
      walking_past_is_honored: true,
    },
  });
}
