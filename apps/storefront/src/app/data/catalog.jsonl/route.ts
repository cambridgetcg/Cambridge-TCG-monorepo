/**
 * /data/catalog.jsonl — publication paused.
 *
 * A warning cannot turn internal-only catalog membership into a lawful bulk
 * export. This route performs no query and emits no manifest counts, hashes,
 * SKU rows, membership, or footer aggregates until affirmative public rights
 * exist for the record set.
 */

export async function GET(): Promise<Response> {
  return Response.json(
    {
      error: {
        code: "CATALOG_EXPORT_PAUSED",
        message:
          "The catalog JSONL export is paused because the mixed mirror has no affirmative public membership lineage.",
      },
      publication_status: "withheld-untraced-lineage",
      record_license: "NOASSERTION",
      export_available: false,
      rows_emitted: 0,
      does_not_include: [
        "catalog membership or counts",
        "SKUs or identity hashes",
        "names, rarity, variants, games, sets, images, prices, or history",
        "database queries or streams",
      ],
    },
    {
      status: 503,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Retry-After": "300",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-Content-License": "NOASSERTION",
        "X-Schema-License": "CC0-1.0",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
