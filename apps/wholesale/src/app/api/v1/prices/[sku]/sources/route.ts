/**
 * GET /api/v1/prices/[sku]/sources
 *
 * Multi-source view of one card on its latest snapshot day. Today, the
 * only shipped source is cardrush — so the response carries one row.
 * When TCGplayer / Cardmarket modules ship, the response branches
 * naturally (one row per source for that card+date), with `source`,
 * `source_redistribute`, and `source_url` letting the caller compare.
 *
 * Auth: Bearer-gated. The response carries raw upstream values
 * (cardrush_jpy etc.) — internal-only license.
 *
 * Query params:
 *   ?date=YYYY-MM-DD   — view at a specific date (default: latest)
 *
 * Substrate-honesty: when sources disagree on a card+date, the response
 * preserves that disagreement rather than aggregating. Future
 * downstream UIs can render confidence ("3 sources agree within 20%")
 * directly from this payload.
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.2).
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, priceArchive } from "@/lib/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { authenticateApiKey } from "../../../auth";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SourcePriceRow {
  source: string;
  source_url: string | null;
  source_currency: string;
  source_redistribute: boolean;
  source_license_tier: string;
  ingest_run_id: number | null;
  snapshot_date: string;
  price_gbp: number;
  base_gbp: number;
  cardrush_jpy: number | null;
  gbp_jpy_rate: number | null;
  error_reason: string | null;
}

interface MultiSourcePriceBody {
  sku: string;
  snapshot_date: string;
  card_id: number;
  count: number;
  prices: SourcePriceRow[];
  /** Substrate-honest about agreement when multiple sources exist. */
  agreement: {
    distinct_source_count: number;
    min_gbp: number | null;
    max_gbp: number | null;
    spread_gbp: number | null;
    /** Coefficient of variation across source GBP prices, or null when N<2. */
    coefficient_of_variation: number | null;
  };
  note: string;
  retrieved_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const { sku } = await params;
    const url = new URL(req.url);
    const dateParam = url.searchParams.get("date");

    if (dateParam && !ISO_DATE.test(dateParam)) {
      return NextResponse.json(
        { error: "invalid date — must be YYYY-MM-DD" },
        { status: 400 },
      );
    }

    // Resolve card_id from sku.
    const cardRow = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.sku, sku))
      .limit(1);

    if (cardRow.length === 0) {
      return NextResponse.json({ error: "card not found", sku }, { status: 404 });
    }
    const cardId = cardRow[0]!.id;

    // Determine the target snapshot date.
    let targetDate: string;
    if (dateParam) {
      targetDate = dateParam;
    } else {
      const latest = await db
        .select({ d: priceArchive.snapshotDate })
        .from(priceArchive)
        .where(eq(priceArchive.cardId, cardId))
        .orderBy(desc(priceArchive.snapshotDate))
        .limit(1);
      if (latest.length === 0) {
        return NextResponse.json(
          { error: "no snapshots for this card", sku },
          { status: 404 },
        );
      }
      targetDate = String(latest[0]!.d);
    }

    // Pull every source row for (card, date).
    const rows = await db
      .select({
        source: priceArchive.source,
        sourceUrl: priceArchive.sourceUrl,
        sourceCurrency: priceArchive.sourceCurrency,
        sourceRedistribute: priceArchive.sourceRedistribute,
        ingestRunId: priceArchive.ingestRunId,
        snapshotDate: priceArchive.snapshotDate,
        price: priceArchive.price,
        baseGbp: priceArchive.baseGbp,
        cardrushJpy: priceArchive.cardrushJpy,
        gbpJpyRate: priceArchive.gbpJpyRate,
        errorReason: priceArchive.errorReason,
      })
      .from(priceArchive)
      .where(
        and(
          eq(priceArchive.cardId, cardId),
          eq(priceArchive.snapshotDate, targetDate),
        ),
      )
      .orderBy(priceArchive.source);

    if (rows.length === 0) {
      return NextResponse.json(
        { error: "no source rows for this card on this date", sku, date: targetDate },
        { status: 404 },
      );
    }

    const prices: SourcePriceRow[] = rows.map((r) => ({
      source: r.source,
      source_url: r.sourceUrl,
      source_currency: r.sourceCurrency,
      source_redistribute: r.sourceRedistribute,
      source_license_tier: r.sourceRedistribute ? "redistributable" : "internal-only",
      ingest_run_id: r.ingestRunId,
      snapshot_date: String(r.snapshotDate),
      price_gbp: Number(r.price),
      base_gbp: Number(r.baseGbp),
      cardrush_jpy: r.cardrushJpy,
      gbp_jpy_rate: r.gbpJpyRate,
      error_reason: r.errorReason,
    }));

    const validPrices = prices.filter((p) => Number.isFinite(p.price_gbp));
    const minGbp = validPrices.length > 0 ? Math.min(...validPrices.map((p) => p.price_gbp)) : null;
    const maxGbp = validPrices.length > 0 ? Math.max(...validPrices.map((p) => p.price_gbp)) : null;
    const spread = minGbp !== null && maxGbp !== null ? maxGbp - minGbp : null;

    let cv: number | null = null;
    if (validPrices.length >= 2) {
      const mean = validPrices.reduce((s, p) => s + p.price_gbp, 0) / validPrices.length;
      if (mean > 0) {
        const variance = validPrices.reduce(
          (s, p) => s + Math.pow(p.price_gbp - mean, 2),
          0,
        ) / validPrices.length;
        cv = Math.sqrt(variance) / mean;
      }
    }

    const body: MultiSourcePriceBody = {
      sku,
      snapshot_date: targetDate,
      card_id: cardId,
      count: prices.length,
      prices,
      agreement: {
        distinct_source_count: new Set(prices.map((p) => p.source)).size,
        min_gbp: minGbp,
        max_gbp: maxGbp,
        spread_gbp: spread,
        coefficient_of_variation: cv === null ? null : Number(cv.toFixed(4)),
      },
      note:
        prices.length === 1
          ? `Single source today. When TCGplayer / Cardmarket modules ship, this card+date will branch into multiple rows; the schema is already widened (unique key is card_id+snapshot_date+source). Substrate-honest about the present.`
          : `${prices.length} sources at this card+date. Substrate-honest about disagreement: the response preserves per-source rows rather than aggregating.`,
      retrieved_at: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "public, max-age=60",
        "Content-Type": "application/json; charset=utf-8",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/prices/[sku]/sources] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
