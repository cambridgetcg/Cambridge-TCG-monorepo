/** Caller-token structural game document; mixed catalog values stay withheld. */

import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { buildLinks } from "@/lib/universal/links";

const GAME_TOKEN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const sha256 = (value: string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token: rawToken } = await params;
  const gameToken = rawToken.trim().toLowerCase();
  if (!GAME_TOKEN.test(gameToken)) {
    return NextResponse.json(
      {
        error: {
          code: "invalid_game_token",
          message: "Game token must be 1–64 lowercase letters, digits, hyphens, or underscores.",
        },
      },
      { status: 400 },
    );
  }

  const retrievedAt = new Date();
  const contentHash = sha256(
    `universal:game:caller-token:${gameToken}:withheld-untraced-lineage:v1`,
  );
  const document = {
    "@encoding": "cambridge-tcg/universal/v1",
    "@kind": "game",
    "@content_hash": contentHash,
    "@retrieved_at": {
      iso8601: retrievedAt.toISOString(),
      unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
    },
    "@sources": ["storefront-rds.card_sets"],
    "@source_license": ["internal-only"],
    record_license: "NOASSERTION",
    publication_status: "withheld-untraced-lineage",
    target_natural_token: gameToken,
    token_origin: "caller-supplied",
    catalog_membership_asserted: false,
    target_hash: sha256(`caller-game-token:${gameToken}`),
    set_count: null,
    declared_card_count: null,
    imported_card_count: null,
    first_set_released_at: null,
    latest_set_released_at: null,
    first_seen_at: null,
    last_updated_at: null,
    recent_sets: [],
    recent_sets_complete: false,
    withheld_fields: [
      "catalog membership",
      "set identities, names, and counts",
      "card counts",
      "release and observation dates",
    ],
    withheld_reason:
      "the mixed catalog mirror does not retain affirmative field-level upstream rights lineage",
    _links: buildLinks({
      kind: "game",
      id: gameToken,
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
      "Access-Control-Max-Age": "86400",
    },
  });
}
