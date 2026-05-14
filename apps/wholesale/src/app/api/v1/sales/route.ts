import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock } from "@/lib/stock";
import { authenticateApiKey } from "../auth";

interface SaleItem {
  sku: string;
  qty: number;
  price_gbp?: number;
}

interface SaleRequest {
  channel: string;
  order_ref: string;
  items: SaleItem[];
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = await authenticateApiKey(req);
    if (apiKey instanceof NextResponse) return apiKey;

    const body = (await req.json()) as SaleRequest;

    if (!body.channel || !body.order_ref || !Array.isArray(body.items) || !body.items.length) {
      return NextResponse.json(
        { error: "Missing required fields: channel, order_ref, items" },
        { status: 400 }
      );
    }

    const results: { sku: string; prev_stock: number; new_stock: number; delta: number; deduplicated: boolean }[] = [];
    const errors: { sku: string; error: string }[] = [];

    for (const item of body.items) {
      if (!item.sku || !item.qty || item.qty < 1) {
        errors.push({ sku: item.sku || "unknown", error: "Invalid sku or qty" });
        continue;
      }

      const [card] = await db
        .select({ id: cards.id, stock: cards.stock })
        .from(cards)
        .where(eq(cards.sku, item.sku))
        .limit(1);

      if (!card) {
        errors.push({ sku: item.sku, error: "Card not found" });
        continue;
      }

      const prevStock = card.stock;

      // Record sale via stock service — idempotent by referenceId
      const movement = await db.transaction(async (tx) => {
        const m = await stock.writer.recordSale(tx, {
          cardId: card.id,
          quantity: item.qty,
          channel: body.channel,
          referenceId: `v1:${body.order_ref}:${item.sku}`,
          note: body.order_ref,
        });

        // Dual-write to stock_adjustments for syncUkStock backward compat
        if (m) {
          await tx.insert(stockAdjustments).values({
            cardId: card.id,
            delta: -item.qty,
            reason: "count",
            channel: body.channel,
            note: body.order_ref,
          });
        }

        return m;
      });

      const delta = movement ? -item.qty : 0;
      const newStock = movement ? Math.max(0, prevStock - item.qty) : prevStock;

      results.push({
        sku: item.sku,
        prev_stock: prevStock,
        new_stock: newStock,
        delta,
        deduplicated: movement === null,
      });
    }

    return NextResponse.json(
      {
        order_ref: body.order_ref,
        channel: body.channel,
        processed: results.length,
        errors: errors.length,
        results,
        ...(errors.length > 0 && { error_details: errors }),
      },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/v1/sales] Error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
