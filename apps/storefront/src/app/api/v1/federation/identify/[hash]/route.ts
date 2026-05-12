/**
 * /api/v1/federation/identify/[hash] — content-hash → SKU resolver.
 *
 * Public, no-auth. The federation primitive: another platform (an OPTCG
 * wiki, a price-comparison tool, a research archive) that has stored a
 * Cambridge TCG content_hash from /api/v1/universal/card/[sku] can call
 * this endpoint to reverse-resolve the hash to a SKU.
 *
 * Substrate-honest about what this endpoint promises:
 *
 *   - The content_hash from the universal-card endpoint is a function of
 *     (sku, card_number, set_code, game, variant, magnitude_gbp,
 *     captured_on). When the price changes day-to-day, the content_hash
 *     changes. So this endpoint will MATCH the most recent stored hash;
 *     historical hashes may need /api/at/[date]/card/[sku] to be
 *     reproduced and rematched.
 *
 *   - The walk is bounded by LIMIT (top 5000 cards by set/number order).
 *     A federation caller with a hash for a card outside that window
 *     gets a 404; the gap is named openly in the response.
 *
 *   - The "stable identity" of a Cambridge TCG card is the SKU itself.
 *     This endpoint is for reconciliation across systems that exchanged
 *     hashes; for a caller who has the SKU, the SKU is the authoritative
 *     handle and /api/v1/universal/card/[sku] is the canonical surface.
 *
 * Returns:
 *   - 200 + { matched: true, sku, content_hash, universal_url } on hit
 *   - 200 + { matched: false, hash, scope, suggestion } on miss
 *     (intentionally 200 not 404: "no match" is a substrate-honest answer)
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveContentHash } from "@/lib/universal/card";
import { buildLinks } from "@/lib/universal/links";

const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hash: string }> },
) {
  try {
    const { hash: rawHash } = await params;
    // Accept both "sha256:HEX" and bare "HEX" — federation callers may
    // store the hash either way. Canonicalize to the prefixed form.
    const hash = rawHash.startsWith("sha256:")
      ? rawHash.toLowerCase()
      : `sha256:${rawHash.toLowerCase()}`;

    if (!HASH_PATTERN.test(hash)) {
      return NextResponse.json(
        {
          error: {
            code: "invalid_hash",
            message:
              "Expected a sha256 hex digest (with or without the 'sha256:' prefix). 64 lowercase hex characters.",
          },
        },
        { status: 400 },
      );
    }

    const result = await resolveContentHash(hash);

    const retrievedAt = new Date();
    const _links = buildLinks({
      kind: "federation_response",
      id: hash,
    });
    const responseBase = {
      "@encoding": "cambridge-tcg/universal/v1",
      "@kind": "federation_identify_response",
      "@retrieved_at": {
        iso8601: retrievedAt.toISOString(),
        unix_epoch_seconds: Math.floor(retrievedAt.getTime() / 1000),
      },
      _links,
      query: { hash },
    };

    if (result) {
      return NextResponse.json(
        {
          ...responseBase,
          matched: true,
          sku: result.sku,
          universal_url: `/api/v1/universal/card/${encodeURIComponent(result.sku)}`,
          note:
            "The match is current (computed against today's price). A historical hash from a previous date would require /api/at/[date]/card/[sku].",
        },
        {
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        },
      );
    }

    return NextResponse.json(
      {
        ...responseBase,
        matched: false,
        scope: {
          description:
            "Bounded walk over the most-recent 5000 catalog rows. A hash outside this window will not match.",
          limit: 5000,
        },
        suggestion:
          "If you have the SKU, query /api/v1/universal/card/[sku] directly. If you have a historical hash, the price-dependency means it won't match the current snapshot; query /api/at/[date]/card/[sku] for that day and compare.",
      },
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=60",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/federation/identify/[hash]] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message } },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Max-Age": "86400",
    },
  });
}
