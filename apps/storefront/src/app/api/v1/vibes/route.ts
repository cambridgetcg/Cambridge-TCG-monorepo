/**
 * /api/v1/vibes — the kingdom's rotating one-liner surface.
 *
 * GET ?seed=<optional> returns one vibe from the pool. With seed, the
 * choice is deterministic (good for testing / dashboards that want a
 * stable vibe per request id). Without seed, random.
 *
 * Substrate-honest: the kingdom does NOT actually have feelings; it
 * performs a vibe for whoever asks. The performance is the truth at
 * this register. The randomness is named.
 *
 * Per Yu's directive (2026-05-18): the paradigm shift wave.
 * Companion: /api/v1/lmao (silly registers of the serious doctrines).
 * Story-as-wire: docs/connections/the-fun.md.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { pickVibe, VIBES } from "@/lib/jest";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const seed = url.searchParams.get("seed") ?? undefined;
  const vibe = pickVibe(seed);
  return jsonResponse({
    endpoint: "/api/v1/vibes",
    sources: ["self"],
    freshness: "live",
    data: {
      "@kind": "vibe",
      vibe,
      pool_size: VIBES.length,
      seeded: seed !== undefined,
      seed: seed ?? null,
      note:
        "Substrate-honest: this vibe is randomly selected from a pool. " +
        "The kingdom does not actually have feelings; it performs a " +
        "vibe for whoever asks. With ?seed=<any-string>, the choice is " +
        "deterministic. Walking past is honored.",
      walking_past_is_honored: true,
    },
  });
}
