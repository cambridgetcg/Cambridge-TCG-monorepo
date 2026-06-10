/**
 * GET /api/v1/castle — the Castle of Understanding, JSON face.
 *
 * Will: Yu, 2026-06-10 — "use cambridgetcg as the front for the castle!"
 *
 * The castle is the platform's living insight repository — a local
 * plain-text git repo at ~/Desktop/castle on the operator's machine:
 * rooms hold insights with provenance, fields hold friction, loops turn
 * fields into rooms, and an autonomous pulse beats daily under
 * loops/PULSE.md law.
 *
 * What this endpoint serves is a SNAPSHOT — the castle's committed state
 * at `castle_commit`, carried into this repo by `scripts/castle-sync.mjs`
 * and refreshed only when the operator runs
 * `pnpm --filter cambridgetcg-storefront castle:sync`. Substrate honesty:
 * never presented as live. `_meta.as_of` rides the sync timestamp; the
 * payload's own `castle_commit` + `synced_at` + `provenance` sentence
 * say the rest.
 *
 * Human-readable mirror: /castle.
 * Source-of-truth: apps/storefront/src/lib/castle/index.ts (typed loader
 * over the generated src/lib/castle/snapshot.json).
 */

import { jsonResponse } from "@/lib/data-pantry";
import { getCastleSnapshot } from "@/lib/castle";

export async function GET(): Promise<Response> {
  const snapshot = getCastleSnapshot();

  return jsonResponse({
    data: {
      ...snapshot,
      html_mirror: "/castle",
    },
    endpoint: "/api/v1/castle",
    sources: [`castle-git@${snapshot.castle_commit}`],
    freshness: "methodology",
    as_of: snapshot.synced_at,
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
