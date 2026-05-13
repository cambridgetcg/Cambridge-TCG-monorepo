/**
 * /api/v1/cards/[sku]/cardrush-history — auth-gated CardRush JPY history.
 *
 * Returns up to 90 days of raw cardrush JPY observations for one card.
 * Gated by next-auth session: only signed-in users may consume.
 *
 * ── License interpretation ───────────────────────────────────────────────
 *
 * CardRush ToS forbids commercial *bulk* redistribution of compiled price
 * data. The reading honoured by this endpoint:
 *
 *   "personal decision support for a signed-in user, scoped to one card,
 *    capped at 90 observations, non-bulk, not re-export-friendly, with
 *    upstream attribution and license tier surfaced on the wire."
 *
 * The endpoint enforces this by construction:
 *
 *   - Session required (anonymous callers get 401)
 *   - Scoped to a single SKU per request (no bulk-walk)
 *   - 90-row hard cap (one season of daily observations)
 *   - Response declares `_meta.source_license: ["internal-only"]`
 *   - Response wraps the raw observations in a copy of the license boundary
 *     so the consumer SDK can render the disclaimer
 *
 * Authorization for this interpretation: Yu, 2026-05-13 ("Go ahead for all
 * remaining phases"). The kingdom-081 plan filed this as Phase 5.4 with an
 * explicit operator-gate note; the green-light moves it from gated to shipped.
 *
 * If CardRush's ToS interpretation tightens in the future (legal review
 * finds the personal-decision reading too aggressive), this endpoint
 * downgrades to admin-only or shuts down. The connection-doc records the
 * interpretation; reversal is one route file deletion + a manifest update.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.4).
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { fetchCardrushHistory } from "@/lib/wholesale/client";
import { jsonResponse } from "@/lib/data-pantry";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
): Promise<Response> {
  // ── Session gate (the license-aware tier-2 boundary) ────────────────
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json(
      {
        error: {
          code: "UNAUTHORIZED",
          message:
            "Sign in to view cardrush JPY observation history. The values are " +
            "under CardRush's internal-only license tier; signed-in personal-decision " +
            "use is the platform's reading. Anonymous access is not authorised.",
        },
      },
      { status: 401 },
    );
  }

  const { sku } = await params;
  const url = new URL(req.url);
  const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam) && limitParam > 0
    ? Math.min(limitParam, 90)
    : 90;

  const upstream = await fetchCardrushHistory({ sku, limit });
  if (upstream === null) {
    return NextResponse.json(
      {
        error: {
          code: "NOT_FOUND",
          message:
            "No CardRush observations for this SKU. Either the card has no " +
            "CardRush URL in the wholesale catalog, or the snapshot pipeline " +
            "hasn't yet recorded any successful scrapes for it.",
        },
      },
      { status: 404 },
    );
  }

  return jsonResponse({
    data: {
      sku: upstream.sku,
      cardrush_url: upstream.cardrush_url,
      source: upstream.source,
      count: upstream.count,
      observations: upstream.observations,
      // License boundary echoed inside the data block so a consumer SDK
      // can render the user-facing disclaimer without parsing _meta.
      license_notice: {
        tier: "internal-only",
        upstream: "cardrush",
        rendered_for: session.user.email,
        do_not: [
          "bulk re-export",
          "redistribute as a paid product",
          "publish to a public archive without permission",
        ],
        may: [
          "view for your own buy/sell decisions",
          "save to your own notes",
          "compare against your portfolio holdings",
        ],
        attribution_required: "CardRush JP (cardrush-op.jp / cardrush-pokemon.jp / cardrush-db.jp)",
      },
    },
    endpoint: "/api/v1/cards/[sku]/cardrush-history",
    sources: ["wholesale-rds.price_archive", "cardrush"],
    source_license: ["internal-only", "internal-only"],
    freshness: "price_current",
    license: "internal-only",
    // Don't cache at the CDN — this is per-session.
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
