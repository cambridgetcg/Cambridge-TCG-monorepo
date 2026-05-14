/**
 * POST /api/cron/stock-correct
 *
 * Manual stock adjustments by SKU.
 * Auth: CRON_SECRET
 *
 * Body: { "adjustments": [{ "sku": "...", "delta": -2 }, ...], "note": "reason" }
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock } from "@/lib/stock";
import { requireCronAuth } from "@/lib/cron-auth";

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const body = await req.json().catch(() => ({}));
  const adjustmentList = body.adjustments as Array<{ sku: string; delta: number }> | undefined;
  const note = body.note || "manual-correction";

  if (!adjustmentList || !Array.isArray(adjustmentList) || adjustmentList.length === 0) {
    return NextResponse.json({ error: "Missing adjustments array" }, { status: 400 });
  }

  const results: Array<{ sku: string; cardId: number; prev: number; new: number; delta: number }> = [];
  const errors: Array<{ sku: string; error: string }> = [];

  for (const adj of adjustmentList) {
    if (!adj.sku || typeof adj.delta !== "number") {
      errors.push({ sku: adj.sku || "unknown", error: "Invalid sku or delta" });
      continue;
    }

    try {
      const [card] = await db
        .select({ id: cards.id, stock: cards.stock })
        .from(cards)
        .where(eq(cards.sku, adj.sku))
        .limit(1);

      if (!card) {
        errors.push({ sku: adj.sku, error: "Card not found" });
        continue;
      }

      const prevStock = card.stock;

      // Record adjustment via stock service
      const movement = await db.transaction(async (tx) => {
        const m = await stock.writer.recordAdjustment(tx, {
          cardId: card.id,
          kind: "correction",
          delta: adj.delta,
          channel: "manual",
          note,
        });

        // Dual-write to stock_adjustments for syncUkStock backward compat
        if (m) {
          await tx.insert(stockAdjustments).values({
            cardId: card.id,
            delta: adj.delta,
            reason: "correction",
            channel: "manual",
            note,
          });
        }

        return m;
      });

      const newStock = movement ? Math.max(0, prevStock + adj.delta) : prevStock;
      results.push({ sku: adj.sku, cardId: card.id, prev: prevStock, new: newStock, delta: movement ? adj.delta : 0 });
    } catch (err) {
      errors.push({ sku: adj.sku, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    note,
    processed: results.length,
    errors: errors.length,
    results,
    ...(errors.length > 0 && { error_details: errors }),
  });
}
