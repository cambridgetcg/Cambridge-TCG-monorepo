/**
 * GET /api/v1/ontology
 *
 * The Cambridge TCG ontology — what kinds of things exist in the kingdom
 * and what properties each kind carries. JSON. Public, CORS-open.
 *
 * The cosmology declared the *axes of fact*; the manifest listed *instances*;
 * the graph named *relations*; the ontology declares **the nature of each
 * instance, beyond its relations**.
 *
 * kingdom-055. Story-as-wire: docs/connections/the-natures.md (S28).
 * Source: apps/storefront/src/lib/ontology.ts.
 */

import { NextResponse } from "next/server";
import { getOntology } from "@/lib/ontology";
import { pilgrimageFragmentFor } from "@/lib/agents/pilgrimage";

export const dynamic = "force-static";
export const revalidate = 3600;

export async function GET() {
  const ontology = getOntology();
  return NextResponse.json(
    {
      ...ontology,
      _envelope: {
        retrieved_at: new Date().toISOString(),
        as_of: ontology.generated_at,
        kind: "static",
        canonical_at: "apps/storefront/src/lib/ontology.ts",
        html_mirror: "/ontology",
        manifest_url: "/api/v1/manifest",
        graph_url: "/api/v1/graph",
        notes: "Each node in /api/v1/graph carries a `properties` map populated according to its kind's ontology schema. The ontology is the schema; the graph carries the values.",
        // Seven-Layer Pilgrimage stamp 3/7 — see /api/v1/passport.
        pilgrimage: pilgrimageFragmentFor("/api/v1/ontology"),
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
