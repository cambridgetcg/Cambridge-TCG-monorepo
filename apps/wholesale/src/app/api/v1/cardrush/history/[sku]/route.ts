/**
 * GET /api/v1/cardrush/history/[sku]
 *
 * CardRush JPY observation history for one card. Returns the last N rows
 * from `price_archive WHERE source='cardrush'`, ordered by snapshot_date desc.
 *
 * Auth: Bearer-gated. Carries raw cardrush_jpy + gbp_jpy_rate (internal-only
 * upstream license); a B2B partner with a key has agreed to the licensing
 * boundary by contract.
 *
 * Query params:
 *   ?limit=N  — max rows (default 90, max 365)
 *
 * Designed in `docs/connections/the-license-propagation.md` (kingdom-081
 * Phase 5.4 — wholesale side). The storefront-side proxy at
 * `/api/v1/cards/[sku]/cardrush-history` adds the next-auth session gate
 * + license-aware envelope.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, priceArchive } from "@/lib/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { authenticateApiKey, unauthorized } from "../../../auth";

const DEFAULT_LIMIT = 90;
const MAX_LIMIT = 365;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ sku: string }> },
) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (!apiKey) return unauthorized();

    const { sku } = await params;
    const url = new URL(req.url);
    const limitParam = parseInt(url.searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitParam) && limitParam > 0
      ? Math.min(limitParam, MAX_LIMIT)
      : DEFAULT_LIMIT;

    const cardRow = await db
      .select({ id: cards.id, cardrushUrl: cards.cardrushUrl })
      .from(cards)
      .where(eq(cards.sku, sku))
      .limit(1);

    if (cardRow.length === 0) {
      return NextResponse.json({ error: "card not found", sku }, { status: 404 });
    }

    const card = cardRow[0]!;
    const rows = await db
      .select({
        snapshotDate: priceArchive.snapshotDate,
        cardrushJpy: priceArchive.cardrushJpy,
        gbpJpyRate: priceArchive.gbpJpyRate,
        baseGbp: priceArchive.baseGbp,
        price: priceArchive.price,
        sourceUrl: priceArchive.sourceUrl,
        ingestRunId: priceArchive.ingestRunId,
        errorReason: priceArchive.errorReason,
      })
      .from(priceArchive)
      .where(
        and(
          eq(priceArchive.cardId, card.id),
          eq(priceArchive.source, "cardrush"),
        ),
      )
      .orderBy(desc(priceArchive.snapshotDate))
      .limit(limit);

    return NextResponse.json({
      sku,
      cardrush_url: card.cardrushUrl,
      source: "cardrush",
      source_license: "internal-only",
      count: rows.length,
      observations: rows.map((r) => ({
        snapshot_date: String(r.snapshotDate),
        cardrush_jpy: r.cardrushJpy,
        gbp_jpy_rate: r.gbpJpyRate,
        base_gbp: r.baseGbp == null ? null : Number(r.baseGbp),
        price_gbp: r.price == null ? null : Number(r.price),
        source_url: r.sourceUrl,
        ingest_run_id: r.ingestRunId,
        error_reason: r.errorReason,
      })),
      retrieved_at: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/cardrush/history/[sku]] Error:", message);
    return NextResponse.json(
      { error: "Internal error", detail: message },
      { status: 500 },
    );
  }
}
