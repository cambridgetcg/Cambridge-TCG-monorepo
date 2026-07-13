/**
 * /api/v1/datasets — dataset availability and rights catalog.
 *
 * The commons is endpoint-indexed elsewhere (/data, the manifest). This is the
 * DATASET index: what is available, what is paused, the aggregate rights, and
 * where each surface lives. Default returns the Cambridge-authored registry
 * through the data-pantry envelope. `?format=jsonld` returns only available
 * datasets as a bare schema.org/DataCatalog graph; paused status paths are not
 * presented to crawlers as downloads.
 *
 * CC0 covers these authored catalog descriptions only. It does not grant any
 * right to dataset records and does not change a paused surface into a live
 * export.
 */

import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/data-pantry";
import {
  AVAILABLE_DATASETS,
  DATASETS,
  toDataCatalogJsonLd,
} from "@/lib/datasets";

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
        // This header applies to the authored catalog graph, not its subjects.
        "X-Content-License": "CC0-1.0",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store",
      },
    });
  }

  return jsonResponse({
    data: {
      "@kind": "dataset-catalog",
      catalog:
        "An inventory of available datasets and paused publication surfaces. " +
        "The catalog descriptions are CC0 metadata. Each entry separately " +
        "states record availability, aggregate rights, and named source rights. " +
        "Mixed-rights records, including the collector-events demonstrator, " +
        "remain NOASSERTION.",
      count: DATASETS.length,
      available_count: AVAILABLE_DATASETS.length,
      paused_count: DATASETS.length - AVAILABLE_DATASETS.length,
      datasets: DATASETS.map((d) => ({
        id: d.id,
        name: d.name,
        description: d.description,
        license: d.license,
        tier: d.tier,
        availability: d.availability,
        records_published: d.recordsPublished,
        source_rights: d.sourceRights,
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
    // The catalog metadata is Cambridge-authored. Dataset records remain under
    // the rights declared on their own entries and serving responses.
    sources: ["cambridge-tcg.dataset-registry"],
    source_license: ["cc0"],
    license: "CC0-1.0",
    does_not_include: [
      "This response contains descriptions and links, not rows from any listed dataset.",
      "CC0 covers only the Cambridge-authored catalog metadata; it does not grant reuse rights in dataset records.",
      "Paused entries are publication-status notices. They are excluded from the JSON-LD dataset graph and do not expose records.",
    ],
    freshness: 86400,
    no_cache: true,
    contains_self: true,
  });
}
