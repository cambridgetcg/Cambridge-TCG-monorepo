import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { cards, stockAdjustments } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { stock } from "@/lib/stock";
import { pullOrders, type EbayOrder } from "@/lib/channels/ebay";
import { redactInternalError } from "@/lib/public-errors";

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
    const error = redactInternalError(
      "admin/channels/ebay/import-orders",
      result.error,
    );
    return NextResponse.json({ error }, { status: 502 });
  }

  const ebayOrders = result.data;
  let adjusted = 0;
  let deduplicated = 0;
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

        // Record sale via stock service — idempotent by referenceId
        const movement = await db.transaction(async (tx) => {
          const m = await stock.writer.recordSale(tx, {
            cardId: card.id,
            quantity: li.quantity,
            channel: "ebay",
            referenceId: `ebay:order:${order.ebayOrderId}:sku:${li.sku}`,
            note: `eBay sale: ${order.ebayOrderId}`,
          });

          // Dual-write to stock_adjustments for syncUkStock backward compat
          if (m) {
            await tx.insert(stockAdjustments).values({
              cardId: card.id,
              delta: -li.quantity,
              reason: "count",
              note: `eBay sale: ${order.ebayOrderId}`,
              channel: "ebay-sale",
            });
          }

          return m;
        });

        if (movement) {
          adjusted++;
        } else {
          deduplicated++;
        }
      } catch (err) {
        errors.push({
          ebayOrderId: order.ebayOrderId,
          sku: li.sku,
          error: redactInternalError(
            "admin/channels/ebay/import-orders item",
            err,
          ),
        });
      }
    }
  }

  return NextResponse.json({
    orders_found: ebayOrders.length,
    stock_adjusted: adjusted,
    deduplicated,
    errors,
  });
}
