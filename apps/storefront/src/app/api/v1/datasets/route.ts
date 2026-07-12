/**
 * /api/v1/datasets — the dataset catalog.
 *
 * The commons is endpoint-indexed elsewhere (/data, the manifest). This is the
 * DATASET index: what we publish, under what licence, covering what, and where
 * to get it. Default returns the registry through the data-pantry envelope
 * (the catalog metadata is our own → CC0). `?format=jsonld` returns a bare
 * schema.org/DataCatalog graph for Google Dataset Search + AI crawlers, which
 * want pure schema.org, not our envelope.
 *
 * This route READS the licence truth the source-rights pass hardened on the
 * real routes (via lib/datasets.ts); it never overrides it. It is registered
 * in the redistribution audit (CC0_EXPORT_SURFACES) so this CC0 surface can
 * never drift to citing a non-redistributable origin.
 */

import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import { DATASETS, toDataCatalogJsonLd } from "@/lib/datasets";

// Dynamic (not force-static): the ?format=jsonld branch reads the query
// string, so the route must render per-request. It's cheap and pure — both
// branches set explicit Cache-Control, so the CDN still caches each variant.
export const dynamic = "force-dynamic";

export function GET(request: Request): NextResponse {
  const format = new URL(request.url).searchParams.get("format");

  // Crawler variant: bare schema.org/DataCatalog, no envelope.
  if (format === "jsonld") {
    return NextResponse.json(toDataCatalogJsonLd(), {
      headers: {
        "Content-Type": "application/ld+json; charset=utf-8",
        // The registry (our descriptions) is CC0; individual datasets carry
        // their own licence inside the graph. Honest at both layers.
        "X-Content-License": "CC0-1.0",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  }

  return jsonResponse({
    data: {
      "@kind": "dataset-catalog",
      catalog:
        "The datasets Cambridge TCG publishes as an open data commons. Each " +
        "entry states its true licence: first-party operational data is CC0; " +
        "the bulk card catalogue is a mixed-rights export (NOASSERTION) and is " +
        "never relabelled CC0.",
      count: DATASETS.length,
      datasets: DATASETS.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        license: d.license,
        tier: d.tier,
        source_license: d.source_license,
        temporal_coverage: d.temporalCoverage ?? null,
        variable_measured: d.variableMeasured,
        keywords: d.keywords,
        freshness_note: d.freshness_note,
        methodology: d.methodology ?? null,
        distributions: d.distributions.map((x) => ({
          kind: x.kind,
          url: x.path,
          encoding_format: x.encodingFormat,
          label: x.label,
        })),
      })),
      discovery: {
        jsonld: "/api/v1/datasets?format=jsonld",
        human: "/datasets",
        methodology: "/methodology/data-intentions",
      },
    },
    endpoint: "/api/v1/datasets",
    // The catalog metadata is Cambridge's own authored registry → first-party CC0.
    sources: ["cambridge-tcg.dataset-registry"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    does_not_include: [
      "This CC0 licence covers only the catalog metadata (our own dataset descriptions).",
      "Each listed dataset carries its OWN licence in the `license` field — notably the bulk card catalogue is NOASSERTION, not CC0.",
    ],
    freshness: 86400,
    contains_self: true,
  });
}
