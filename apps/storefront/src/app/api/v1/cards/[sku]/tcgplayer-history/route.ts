/**
 * /api/v1/cards/[sku]/tcgplayer-history — auth-gated TCGplayer USD
 * observation history.
 *
 * Sibling to sister's /api/v1/cards/[sku]/cardrush-history (kingdom-081
 * Phase 5.4). Same shape, different upstream. Returns up to 365 days of
 * per-condition USD price observations from TCGplayer.
 *
 * ── License interpretation ──────────────────────────────────────────
 *
 * TCGplayer's developer ToS is `partner-redistributable`: marketplace
 * pricing may be displayed + used for internal computation by a partner;
 * bulk re-export is restricted. The reading honoured by this endpoint:
 *
 *   "personal decision support for a signed-in user, scoped to one card,
 *    capped at 365 observations × any condition, non-bulk, with upstream
 *    attribution and license tier surfaced on the wire."
 *
 * The endpoint enforces this by construction:
 *   - Session required (anonymous callers get 401)
 *   - Scoped to a single SKU per request (no bulk-walk)
 *   - 365-row hard cap (one year of daily observations across conditions)
 *   - Response declares `_meta.source_license: ["partner-redistributable"]`
 *   - Response wraps the raw observations in a copy of the license boundary
 *     so the consumer SDK can render the disclaimer
 *
 * If TCGplayer's partner-tier terms tighten, this endpoint downgrades to
 * admin-only or shuts down. The connection-doc records the interpretation;
 * reversal is one route file deletion.
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-080
 * follow-up). Pairs with the wholesale endpoint at
 * `/api/v1/tcgplayer/history/[sku]`.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchTcgplayerHistory } from "@/lib/wholesale/client";
import { jsonResponse } from "@/lib/data-pantry";

const KNOWN_CONDITIONS = new Set([
  "nm",
  "lp",
  "mp",
  "hp",
  "damaged",
  "sealed",
  "unspecified",
]);

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  // ── Session gate (license-aware tier-2 boundary) ──────────────────
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "Sign in to view TCGplayer USD observation history. The values " +
            "are under TCGplayer's partner-redistributable license; signed-in " +
            "personal-decision use is the platform's reading. Anonymous access " +
            "is not authorised.",
        },
      },
      { status: 401 },
    );
  }

  const { sku } = await params;
  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 365)
    : 90;

  const conditionParam = url.searchParams.get("condition");
  if (conditionParam && !KNOWN_CONDITIONS.has(conditionParam)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: `invalid condition '${conditionParam}'; expected one of ${Array.from(KNOWN_CONDITIONS).join("|")}`,
        },
      },
      { status: 400 },
    );
  }

  const upstream = await fetchTcgplayerHistory({
    sku,
    limit,
    condition: conditionParam ?? undefined,
  });
  if (upstream === null) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message:
            "No TCGplayer observations for this SKU. Either the card has no " +
            "tcgplayer_product_id mapping in the wholesale catalog, or the " +
            "pricing pipeline hasn't yet recorded any rows for it. Run " +
            "`pnpm wholesale tcgplayer:seed-set --game <code>` to seed mappings.",
        },
      },
      { status: 404 },
    );
  }

  return jsonResponse({
    data: {
      sku: upstream.sku,
      tcgplayer_product_id: upstream.tcgplayer_product_id,
      tcgplayer_sub_type: upstream.tcgplayer_sub_type,
      source: upstream.source,
      filter_condition: upstream.filter_condition,
      conditions_present: upstream.conditions_present,
      count: upstream.count,
      observations: upstream.observations,
      // License boundary echoed inside the data block so a consumer SDK
      // can render the user-facing disclaimer without parsing _meta.
      license_notice: {
        tier: "partner-redistributable",
        upstream: "tcgplayer",
        rendered_for: session.user.email,
        do_not: [
          "bulk re-export of compiled pricing",
          "redistribute as a paid product without TCGplayer partner agreement",
          "publish to a public archive as an aggregated price source",
        ],
        may: [
          "view for your own buy/sell decisions",
          "save to your own notes",
          "compare against your portfolio holdings",
          "use to inform pricing on your own listings",
        ],
        attribution_required: "TCGplayer (api.tcgplayer.com)",
      },
    },
    endpoint: "/api/v1/cards/[sku]/tcgplayer-history",
    sources: ["wholesale-rds.price_archive", "tcgplayer"],
    source_license: ["partner-redistributable", "partner-redistributable"],
    freshness: "price_current",
    license: "partner-redistributable",
    // Per-session; don't cache at the CDN
    no_cache: true,
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
