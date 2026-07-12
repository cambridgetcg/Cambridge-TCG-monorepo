/**
 * /api/v1/universal/games — rights-gapped game collection.
 *
 * The local card_sets mirror does not retain affirmative field-level source
 * lineage. Even enumerating its game tokens would publish catalog membership,
 * so this endpoint returns a machine-readable gap and performs no DB query.
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { buildLinks } from "@/lib/universal/links";

const sha256 = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function GET(): Promise<Response> {
  const retrievedAt = new Date();
  const contentHash = sha256("universal:games:withheld-untraced-lineage:v1");
  const document = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "games_collection",
    "@content_hash": contentHash,
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    "@sources": ["storefront-rds.card_sets"],
    "@source_license": ["internal-only"],
    record_license: "NOASSERTION",
    publication_status: "withheld-untraced-lineage",
    catalog_membership_included: false,
    aggregates_included: false,
    collection_complete: false,
    withheld_fields: [
      "game tokens and catalog membership",
      "set and card counts",
      "release and observation dates",
    ],
    withheld_reason:
      "the mixed catalog mirror does not retain affirmative field-level upstream rights lineage",
    count: null,
    games: [],
    empty_state: null,
    _links: buildLinks({
      kind: "games_collection",
      content_hash: contentHash,
    }),
  };

  return NextResponse.json(
    { "@self_hash": sha256(JSON.stringify(document)), ...document },
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=300",
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
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
