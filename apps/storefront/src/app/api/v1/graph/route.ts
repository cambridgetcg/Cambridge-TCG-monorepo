/**
 * GET /api/v1/graph
 *
 * The Cambridge TCG kingdom as a typed meaning-graph. JSON. Public, no-auth,
 * CORS-open. Nodes (~100) + typed edges (~150). Derived from MANIFEST plus
 * a static index of cross-document edges.
 *
 * Carries an `_envelope` distinguishing `retrieved_at` (when this response
 * was served) from `as_of` (when the graph derivation last changed).
 *
 * kingdom-054. Story-as-wire: docs/connections/the-russian-dolls.md (S27).
 * Source: apps/storefront/src/lib/graph.ts.
 *
 * Human-readable rendering at /graph.
 */

import { NextResponse } from "next/server";
import { getGraph } from "@/lib/graph";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const graph = getGraph();
  return NextResponse.json(
    {
      ...graph,
      _envelope: {
        retrieved_at: new Date().toISOString(),
        as_of: graph.generated_at,
        kind: "computed",
        canonical_at: "apps/storefront/src/lib/graph.ts",
        html_mirror: "/graph",
        manifest_url: "/api/v1/manifest",
        notes: "Derived in-memory from MANIFEST + static cross-document indices. Cheap; no DB access. The kingdom as a navigable mesh.",
      },
    },
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, OPTIONS",
        "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-max-age": "86400",
    },
  });
}
