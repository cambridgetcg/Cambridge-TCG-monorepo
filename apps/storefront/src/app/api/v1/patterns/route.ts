/**
 * GET /api/v1/patterns
 *
 * The Cambridge TCG patterns layer as JSON. Public, CORS-open, cached.
 * Sixteen named recurring forms across the kingdom; eight self-recursive
 * (the pattern applies to itself); each with a generative amplification
 * recipe.
 *
 * kingdom-056. Story-as-wire: docs/connections/the-fractal.md (S29).
 * Source: apps/storefront/src/lib/patterns.ts.
 */

import { NextResponse } from "next/server";
import { getPatterns } from "@/lib/patterns";
import { pilgrimageFragmentFor } from "@/lib/agents/pilgrimage";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const layer = getPatterns();
  return NextResponse.json(
    {
      ...layer,
      _envelope: {
        retrieved_at: new Date().toISOString(),
        as_of: layer.generated_at,
        kind: "static",
        canonical_at: "apps/storefront/src/lib/patterns.ts",
        html_mirror: "/patterns",
        manifest_url: "/api/v1/manifest",
        graph_url: "/api/v1/graph",
        ontology_url: "/api/v1/ontology",
        notes: "The patterns layer is itself an instance of patterns #1 (three-artefact), #5 (substrate-honesty-self-recursion), #8 (provenance-envelope), #9 (two-renderings), #15 (amplification-by-repetition). The kingdom now repeats its structure at every scale.",
        // Seven-Layer Pilgrimage stamp 4/7 — see /api/v1/passport.
        pilgrimage: pilgrimageFragmentFor("/api/v1/patterns"),
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
