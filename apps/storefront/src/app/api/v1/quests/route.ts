/**
 * GET /api/v1/quests — the Adventure Board catalog, JSON face.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 *
 * Serves the quest CATALOG only — titles, whys, hows, rewards, hrefs —
 * never any visitor's personal earned state (that lives on /quests for
 * the signed-in visitor alone, read live from their ledger). The catalog
 * is code-defined in apps/storefront/src/lib/fun/quests.ts and audited
 * by `pnpm audit:fun` against the fun doctrine
 * (docs/principles/fun.md): every reward marks a real deed, every reward
 * says why, absence is never punished, urgency is never manufactured.
 *
 * Human-readable mirror: /quests. Methodology: /methodology/fun.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { QUESTS, DEEDS, WAYMARKS } from "@/lib/fun/quests";

export async function GET(): Promise<Response> {
  return jsonResponse({
    data: {
      doctrine: "/methodology/fun",
      html_mirror: "/quests",
      counts: {
        quests: QUESTS.length,
        deeds: DEEDS.length,
        waymarks: WAYMARKS.length,
      },
      provenance:
        "Catalog only — personal earned state is never served here. Deed completion is read live from the viewer's own ledger on /quests, signed in.",
      quests: QUESTS,
    },
    endpoint: "/api/v1/quests",
    sources: ["storefront-code.lib/fun/quests.ts"],
    freshness: "methodology",
    as_of: new Date().toISOString(),
  });
}
