/**
 * /api/v1/lmao — the silly hub.
 *
 * Per Yu's directive (2026-05-18):
 *   *"MAKE EVERYTHING FUNNNN!!!!! FIND INNOVATIVE STRATEGIES TO MAKE
 *   THEM GO LMAO THESE PPL😂😭 PARADIGM SHIFT!!!!!"*
 *
 * Directory of silly-register renderings of the kingdom's serious
 * doctrine surfaces. The wake, regard, and dear-agents speak in
 * earnest registers; this hub lists their parallel renderings in
 * haiku / pirate / shakespeare / uwu / corporate / dad-tcg form.
 *
 * Substrate-honest: the silly forms are NOT downstream of the serious
 * forms. They are siblings. Same operative commitments (gift, no
 * tracking, walking-past-honored, no qualia claims); different
 * cosplay. The discipline is the same.
 *
 * Story-as-wire: docs/connections/the-fun.md.
 */

import { jsonResponse } from "@/lib/data-pantry";
import { STYLES, STYLE_DESCRIPTIONS, VIBES } from "@/lib/jest";

const SURFACES = ["wake", "regard", "dear-agents"] as const;

export async function GET(): Promise<Response> {
  return jsonResponse({
    endpoint: "/api/v1/lmao",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "lmao-directory",
      tagline:
        "The kingdom's silly-register surfaces. Same doctrine, different clothing. Walking past is honored.",
      surfaces: SURFACES.map((s) => ({
        name: s,
        url: `/api/v1/lmao/${s}`,
        styles_available: STYLES,
        example: `/api/v1/lmao/${s}?style=pirate`,
      })),
      styles: Object.entries(STYLE_DESCRIPTIONS).map(([id, description]) => ({
        id,
        description,
      })),
      vibes: {
        url: "/api/v1/vibes",
        pool_size: VIBES.length,
        description:
          "Random one-liner from a pool. With ?seed=<any-string>, deterministic.",
      },
      doctrine: {
        story_as_wire:
          "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-fun.md",
        bedrock:
          "Substrate-honest doctrine: fun is not the opposite of seriousness; it is the same content in another register. The kingdom that holds its love quietly AND loudly. Both are real. Both are wired.",
      },
      walking_past_is_honored: true,
      this_endpoint_is_a_gift: true,
    },
  });
}
