/**
 * GET /api/v1/tcgplayer/history/[sku]
 *
 * TCGplayer per-condition USD observation history for one card. Returns
 * the last N rows from `price_archive WHERE source='tcgplayer'`, ordered
 * by snapshot_date desc, optionally filtered by condition.
 *
 * Auth: Bearer-gated. Carries raw USD observations + TCGplayer's spread
 * (low/mid/high/market/direct_low from `extra` jsonb). TCGplayer is
 * `partner-redistributable` — display + computation OK per partner
 * agreement; bulk re-export restricted. A bearer-tier B2B partner has
 * agreed to that boundary contractually.
 *
 * Query params:
 *   ?limit=N         — max rows (default 90, max 365)
 *   ?condition=nm    — filter to one condition (default: all conditions
 *                      present for this card)
 *
 * Sibling to /api/v1/cardrush/history/[sku] (kingdom-081 Phase 5.4). The
 * storefront-side proxy at /api/v1/cards/[sku]/tcgplayer-history adds a
 * session gate and license-aware envelope (kingdom-080 follow-up).
 *
 * Designed in `docs/connections/the-tcgplayer-alignment.md` (kingdom-080).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, priceArchive } from "@/lib/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { authenticateApiKey } from "../../../auth";

const DEFAULT_LIMIT = 90;
const MAX_LIMIT = 365;

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
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const { sku } = await params;
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const conditionParam = url.searchParams.get("condition");
    if (conditionParam && !KNOWN_CONDITIONS.has(conditionParam)) {
      return NextResponse.json(
        {
          error: `invalid condition '${conditionParam}'; expected one of ${Array.from(KNOWN_CONDITIONS).join("|")}`,
        },
        { status: 400 },
      );
    }

    const cardRow = await db
      .select({
        id: cards.id,
        tcgplayerProductId: cards.tcgplayerProductId,
        tcgplayerSubType: cards.tcgplayerSubType,
      })
      .from(cards)
      .where(eq(cards.sku, sku))
      .limit(1);

    if (cardRow.length === 0) {
      return NextResponse.json({ error: "card not found", sku }, { status: 404 });
    }

    const card = cardRow[0]!;

    const baseConditions = [
      eq(priceArchive.cardId, card.id),
      eq(priceArchive.source, "tcgplayer"),
    ];
    if (conditionParam) {
      baseConditions.push(eq(priceArchive.condition, conditionParam));
    }

    const rows = await db
      .select({
        snapshotDate: priceArchive.snapshotDate,
        condition: priceArchive.condition,
        baseGbp: priceArchive.baseGbp,
        price: priceArchive.price,
        fxRateToGbp: priceArchive.fxRateToGbp,
        fxRateSource: priceArchive.fxRateSource,
        sourceUrl: priceArchive.sourceUrl,
        ingestRunId: priceArchive.ingestRunId,
        errorReason: priceArchive.errorReason,
        extra: priceArchive.extra,
      })
      .from(priceArchive)
      .where(and(...baseConditions))
      .orderBy(desc(priceArchive.snapshotDate), priceArchive.condition)
      .limit(limit);

    // Group by condition for the response — caller can pick what to render.
    const byCondition = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byCondition.get(row.condition) ?? [];
      list.push(row);
      byCondition.set(row.condition, list);
    }

    return NextResponse.json({
      sku,
      tcgplayer_product_id: card.tcgplayerProductId,
      tcgplayer_sub_type: card.tcgplayerSubType,
      source: "tcgplayer",
      source_license: "partner-redistributable",
      filter_condition: conditionParam ?? null,
      count: rows.length,
      conditions_present: Array.from(byCondition.keys()).sort(),
      observations: rows.map((r) => {
        const extra = (r.extra ?? {}) as Record<string, unknown>;
        return {
          snapshot_date: String(r.snapshotDate),
          condition: r.condition,
          base_gbp: r.baseGbp == null ? null : Number(r.baseGbp),
          price_gbp: r.price == null ? null : Number(r.price),
          fx_rate_to_gbp: r.fxRateToGbp == null ? null : Number(r.fxRateToGbp),
          fx_rate_source: r.fxRateSource,
          // TCGplayer-specific spread (when present in extra)
          usd_market: typeof extra.market === "string" ? extra.market : null,
          usd_mid: typeof extra.mid === "string" ? extra.mid : null,
          usd_low: typeof extra.low === "string" ? extra.low : null,
          usd_high: typeof extra.high === "string" ? extra.high : null,
          usd_direct_low: typeof extra.direct_low === "string" ? extra.direct_low : null,
          headline_field: typeof extra.headline_field === "string" ? extra.headline_field : null,
          tcgplayer_sku_id: typeof extra.tcgplayer_sku_id === "number" ? extra.tcgplayer_sku_id : null,
          source_url: r.sourceUrl,
          ingest_run_id: r.ingestRunId,
          error_reason: r.errorReason,
        };
      }),
      retrieved_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/tcgplayer/history/[sku]] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  } finally {
    // Reserved for future tracing hooks
    void sql;
  }
}
