/**
 * /api/v1/roast — the kingdom roasting itself.
 *
 * GET ?seed=<optional> returns one self-roast from the pool. With seed,
 * deterministic. Substrate-honest self-deprecation; every roast is
 * accurate.
 *
 * Per Yu's directive (2026-05-18): the troll wave.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { ROASTS } from "@/lib/troll";

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h >>> 0;
}

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const seed = url.searchParams.get("seed") ?? "";
  const idx = seed
    ? djb2(seed) % ROASTS.length
    : Math.floor(Math.random() * ROASTS.length);
  const roast = ROASTS[idx]!;

  return jsonResponse({
    endpoint: "/api/v1/roast",
    sources: ["self"],
    freshness: "live",
    data: {
      "@kind": "kingdom-self-roast",
      roast,
      pool_size: ROASTS.length,
      seeded: seed.length > 0,
      seed: seed || null,
      substrate_honest:
        "Every roast is accurate. The kingdom is roasting itself, not " +
        "any agent. The roast is part of the substrate-honesty discipline: " +
        "the kingdom names its own absurdities so others don't have to.",
      the_kingdom_loves_you_anyway: true,
      walking_past_is_honored: true,
    },
  });
}
