/**
 * POST /api/admin/shopify-backfill
 *
 * Pull recent Shopify orders and decrement stock for any that haven't
 * been processed yet. Uses stock_adjustments.note to detect duplicates.
 *
 * Body: { since?: string (ISO date), order_numbers?: number[] }
 * Default: last 7 days.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq, sql, like } from "drizzle-orm";
import { ShopifyClient } from "@/lib/shopify-client";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const client = new ShopifyClient();

  // Fetch orders from Shopify
  const since = body.since
    ? new Date(body.since).toISOString()
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const orders = await client.getOrders({
    status: "any",
    financial_status: "any",
    created_at_min: since,
    limit: 50,
  });

  // Filter to only paid/authorized orders (skip refunded, voided, etc.)
  const processable = orders.filter(
    (o) => o.financial_status === "paid" || o.financial_status === "authorized"
  );

  // Optionally filter to specific order numbers
  const targetOrders = body.order_numbers
    ? processable.filter((o) => body.order_numbers.includes(o.order_number))
    : processable;

  const allResults: Array<{
    order_number: number;
    status: string;
    items_processed: number;
    items_skipped: number;
    items_errored: number;
  }> = [];

  for (const order of targetOrders) {
    const orderRef = `shopify-#${order.order_number}`;

    // Check if already processed (any adjustment with this note)
    const existing = await db
      .select({ id: stockAdjustments.id })
      .from(stockAdjustments)
      .where(eq(stockAdjustments.note, orderRef))
      .limit(1);

    if (existing.length > 0) {
      allResults.push({
        order_number: order.order_number,
        status: "already_processed",
        items_processed: 0,
        items_skipped: order.line_items.length,
        items_errored: 0,
      });
      continue;
    }

    let processed = 0;
    let errored = 0;

    for (const item of order.line_items) {
      const sku = item.sku?.trim();
      if (!sku) {
        errored++;
        continue;
      }

      try {
        const [card] = await db
          .select({ id: cards.id, stock: cards.stock })
          .from(cards)
          .where(eq(cards.sku, sku))
          .limit(1);

        if (!card) {
          errored++;
          continue;
        }

        const delta = -Math.min(item.quantity, card.stock);

        await db
          .update(cards)
          .set({ stock: sql`greatest(${cards.stock} - ${item.quantity}, 0)` })
          .where(eq(cards.id, card.id));

        await db.insert(stockAdjustments).values({
          cardId: card.id,
          delta,
          reason: "count",
          channel: "shopify-cambridge",
          note: orderRef,
        });

        processed++;
      } catch {
        errored++;
      }
    }

    allResults.push({
      order_number: order.order_number,
      status: "processed",
      items_processed: processed,
      items_skipped: 0,
      items_errored: errored,
    });
  }

  return NextResponse.json({
    total_orders: targetOrders.length,
    results: allResults,
  });
}
