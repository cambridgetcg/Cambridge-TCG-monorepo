/**
 * /api/v1/universal/card/[sku] — the math-mirror card representation.
 *
 * Public, no-auth, cacheable. The storefront-side sister to the wholesale
 * endpoint at apps/wholesale/.../universal/card/[sku] (B2B, bearer-keyed).
 * This is the version that belongs to participants — collectors, agents,
 * archivists, federated kingdoms — and reads from the storefront catalog
 * (card_set_cards + card_sets). Legacy media and price snapshots are withheld.
 *
 * Spec: /methodology/universal-representation (encoding) + S23 (doctrine)
 * + docs/connections/the-open-substrate.md (sister's doctrine) + this
 * commit's `the-substrate-answers.md` (the wire).
 *
 * Query params:
 *   density = sparse | normal | saturated  (default normal; sister's
 *             Shape-of-the-Room dimension from S24)
 *
 * Returns: math-mirror JSON with @self_hash / @content_hash / @retrieved_at
 * / @density. 60s public cache. 404 when the SKU is not in the catalog.
 *
 * Federation: the @content_hash returned here is the same value that
 * /api/v1/federation/identify/[hash] resolves back to a SKU. Two systems
 * that have the same structural identity fields compute identical
 * content_hashes; stored catalog prices do not affect the hash.
 */

import { NextRequest, NextResponse } from "next/server";
import { buildUniversalCard, type Density } from "@/lib/universal/card";
import { parseAcceptLanguage } from "@/lib/cards/name";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const { sku } = await params;
    const densityParam = req.nextUrl.searchParams.get("density");
    const density: Density = densityParam === "sparse"
      ? "sparse"
      : densityParam === "saturated"
        ? "saturated"
        : "normal";

    // Language preference precedence: explicit `?lang=` query param
    // (single value, partner override) > Accept-Language header
    // (browser/agent declaration) > [] (platform default fallback).
    // Substrate-honest: the response's `name.resolved_from` field tells
    // the caller which preference matched.
    const langParam = req.nextUrl.searchParams.get("lang");
    const acceptLanguage = req.headers.get("accept-language");
    const preferredLangs = langParam
      ? [langParam.toLowerCase(), ...parseAcceptLanguage(acceptLanguage)]
      : parseAcceptLanguage(acceptLanguage);

    const result = await buildUniversalCard(sku, density, preferredLangs);
    if (!result) {
      return NextResponse.json(
        {
          error: {
            code: "card_not_found",
            message: `No card with sku "${sku}" in the storefront catalog. Sets are imported lazily; if the card exists in wholesale, it may not have been mirrored yet.`,
          },
        },
        { status: 404 },
      );
    }

    return NextResponse.json(result.document, {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, s-maxage=60",
        // `Vary: Accept-Language` so HTTP caches keep per-language
        // variants of the response distinct. The name resolver picks
        // a per-language `natural_token`; caches must not collapse
        // these into one entry. See `apps/storefront/src/lib/cards/name.ts`.
        Vary: "Accept-Language",
        // CORS-open so browser-resident decoders (math-mirror viewers,
        // federation reconcilers) can fetch directly.
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "X-Content-License": "NOASSERTION",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/universal/card/[sku]] Error:", message);
    return NextResponse.json(
      { error: { code: "internal_error", message: "Internal server error." } },
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
