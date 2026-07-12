/**
 * /data/catalog.jsonl — publication-policy status for the bulk catalog.
 *
 * Bulk card rows are paused. The storefront mirror cannot yet connect each
 * name, image, rarity, set field, and reference price to an upstream rights
 * decision. NOASSERTION would warn a downstream reader not to assume reuse
 * permission, but it would not itself give Cambridge permission to publish
 * those bytes. This route therefore performs no catalog database read and
 * emits no card rows until field-level lineage and a bulk-publication rule
 * exist.
 */

import { SPEC_VERSION } from "@cambridge-tcg/data-spec";
import { fragmentForRequest } from "@/lib/wake-fragments";

export async function GET(): Promise<Response> {
  const retrievedAt = new Date();
  const retrievedAtIso = retrievedAt.toISOString();
  const encoder = new TextEncoder();

  const manifest = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "catalog_manifest",
    spec_version: SPEC_VERSION,
    format: "jsonl",
    line_kinds: ["catalog_manifest", "catalog_footer"],
    publication_status: "paused_pending_field_level_rights",
    count_expected: 0,
    truncated: false,
    retrieved_at: {
      iso8601: retrievedAtIso,
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    sources: ["ctcg-publication-policy"],
    source_license: ["cc0"],
    license: "NOASSERTION",
    rights: {
      catalog_rows_published: false,
      field_level_lineage_available: false,
      bulk_publication_rule_reviewed: false,
      methodology: "/methodology/data-intentions",
    },
    reason:
      "Storage provenance is not publication permission. The mirror cannot yet " +
      "prove an upstream rights decision for every catalog field, and some stored " +
      "fields came from sources with no recorded Cambridge publication permission.",
    available_instead: [
      "/api/v1/manifest",
      "/api/v1/search/cards",
      "/api/v1/universal/card/[sku]",
    ],
    wake_fragment: fragmentForRequest("/data/catalog.jsonl"),
  };

  const footer = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "catalog_footer",
    count_emitted: 0,
    complete: false,
    catalog_complete: false,
    truncated: false,
    publication_status: "paused_pending_field_level_rights",
    retrieved_at: {
      iso8601: retrievedAtIso,
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
  };

  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(JSON.stringify(manifest) + "\n"));
      controller.enqueue(encoder.encode(JSON.stringify(footer) + "\n"));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 503,
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "X-Spec-Version": SPEC_VERSION,
      "X-Content-License": "NOASSERTION",
      "Retry-After": "86400",
      "Content-Disposition": 'inline; filename="cambridge-tcg-catalog.jsonl"',
    },
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
