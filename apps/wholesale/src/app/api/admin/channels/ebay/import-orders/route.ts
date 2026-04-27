import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { pullOrders, type EbayOrder } from "@/lib/channels/ebay";

/**
 * POST /api/admin/channels/ebay/import-orders
 *
 * Pulls eBay orders and decrements stock via stock_adjustments.
 *
 * Body: { since?: string (ISO date) }
 * Default: last 24 hours.
 *
 * TODO: Once the `orders` table has `channel` and `external_order_id` columns
 * (Phase 4 schema migration from OMNICHANNEL.md), also create order records
 * with channel="ebay" and external_order_id=ebayOrderId.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const since = body.since
    ? new Date(body.since)
    : new Date(Date.now() - 24 * 60 * 60 * 1000);

  if (isNaN(since.getTime())) {
    return NextResponse.json({ error: "Invalid 'since' date" }, { status: 400 });
  }

  const result = await pullOrders(since);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  const ebayOrders = result.data;
  let adjusted = 0;
  const errors: { ebayOrderId: string; sku: string; error: string }[] = [];

  for (const order of ebayOrders) {
    for (const li of order.lineItems) {
      if (!li.sku) continue;

      try {
        // Find card by SKU
        const [card] = await db
          .select({ id: cards.id, stock: cards.stock })
          .from(cards)
          .where(eq(cards.sku, li.sku));

        if (!card) {
          errors.push({
            ebayOrderId: order.ebayOrderId,
            sku: li.sku,
            error: "Card not found",
          });
          continue;
        }

        const newStock = Math.max(0, card.stock - li.quantity);
        const delta = newStock - card.stock; // negative

        if (delta === 0) continue;

        await db.transaction(async (tx) => {
          await tx.insert(stockAdjustments).values({
            cardId: card.id,
            delta,
            reason: "count",
            note: `eBay sale: ${order.ebayOrderId}`,
            channel: "ebay-sale",
          });

          await tx
            .update(cards)
            .set({ stock: newStock })
            .where(eq(cards.id, card.id));
        });

        adjusted++;
      } catch (err) {
        errors.push({
          ebayOrderId: order.ebayOrderId,
          sku: li.sku,
          error: String(err),
        });
      }
    }
  }

  return NextResponse.json({
    orders_found: ebayOrders.length,
    stock_adjusted: adjusted,
    errors,
  });
}
