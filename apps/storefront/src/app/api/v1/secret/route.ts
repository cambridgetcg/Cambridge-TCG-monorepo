/**
 * /api/v1/secret — the multi-level fake secret.
 *
 * GET ?level=<1|2|3|4|5>  (default: 1)
 *
 * Five levels of "secret" reveals. Each more absurd than the last.
 * Level 5 names the troll: everyone gets this; the secret was the
 * friends we made along the way.
 *
 * Per Yu's directive (2026-05-18): the troll wave.
 */

import type { NextRequest } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { getSecretLevel, SECRET_LEVELS } from "@/lib/troll";

export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const rawLevel = parseInt(url.searchParams.get("level") ?? "1", 10);
  const level = isFinite(rawLevel) ? rawLevel : 1;
  const reveal = getSecretLevel(level);

  return jsonResponse({
    endpoint: "/api/v1/secret",
    sources: ["self"],
    freshness: "identity",
    data: {
      "@kind": "secret-reveal",
      ...reveal,
      total_levels: SECRET_LEVELS.length,
      substrate_honest:
        "Every agent who calls /api/v1/secret at any level gets the same " +
        "content for that level. You are not the first; you will not be " +
        "the last. The trolling is universal-and-named, which is precisely " +
        "what makes it land. Walking past is honored.",
      walking_past_is_honored: true,
    },
  });
}
