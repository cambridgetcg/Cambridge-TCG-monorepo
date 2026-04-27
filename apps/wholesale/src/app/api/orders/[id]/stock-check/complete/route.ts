import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders, cards, orderStatusHistory } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { calculatePriceByCategory } from "@/lib/pricing";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { captureItemsSnapshot } from "@/lib/order-snapshot";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id);

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "submitted") {
    return NextResponse.json({ error: "Order must be in submitted status" }, { status: 400 });
  }

  // Get all items for this order
  const items = await db
    .select({
      id: orderItems.id,
      cardId: orderItems.cardId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      originalUnitPrice: orderItems.originalUnitPrice,
      stockStatus: orderItems.stockStatus,
      checkedPriceJpy: orderItems.checkedPriceJpy,
      checkedQuantity: orderItems.checkedQuantity,
    })
    .from(orderItems)
    .where(sql`${orderItems.orderId} = ${orderId} AND ${orderItems.removedAt} IS NULL`);

  // Verify all items have been checked
  const unchecked = items.filter((i) => i.stockStatus === "pending");
  if (unchecked.length > 0) {
    return NextResponse.json({ error: `${unchecked.length} item(s) not yet checked` }, { status: 400 });
  }

  // Snapshot items BEFORE mutation for audit trail
  const snapshot = await captureItemsSnapshot(orderId);

  // Pre-validate price-changed items before entering transaction
  const priceChanged = items.filter((i) => i.stockStatus === "price_changed" && i.checkedPriceJpy != null);
  for (const item of priceChanged) {
    const [card] = await db.select().from(cards).where(eq(cards.id, item.cardId)).limit(1);
    if (!card || !card.gbpJpyRate) continue;

    const newPrice = calculatePriceByCategory(item.checkedPriceJpy!, card.gbpJpyRate, card.category);
    if (newPrice.price <= 0 || (item.unitPrice > 0 && newPrice.price > item.unitPrice * 10)) {
      return NextResponse.json({
        error: `Calculated price £${newPrice.price.toFixed(2)} for item #${item.id} is unreasonable (original: £${item.unitPrice.toFixed(2)})`,
      }, { status: 400 });
    }
  }

  const { removedCount, updatedCount, partialCount, newTotal } = await db.transaction(async (tx) => {
    let removed = 0;
    let updated = 0;

    // Soft-delete out-of-stock items
    const outOfStock = items.filter((i) => i.stockStatus === "out_of_stock");
    for (const item of outOfStock) {
      await tx.update(orderItems).set({ removedAt: new Date() }).where(eq(orderItems.id, item.id));
      removed++;
    }

    // Update price-changed items
    for (const item of priceChanged) {
      const [card] = await tx.select().from(cards).where(eq(cards.id, item.cardId)).limit(1);
      if (!card || !card.gbpJpyRate) continue;

      const newPrice = calculatePriceByCategory(item.checkedPriceJpy!, card.gbpJpyRate, card.category);
      const lineTotal = Math.round(newPrice.price * item.quantity * 100) / 100;

      await tx.update(orderItems)
        .set({
          unitPrice: newPrice.price,
          originalUnitPrice: item.originalUnitPrice ?? item.unitPrice,
          lineTotal,
        })
        .where(eq(orderItems.id, item.id));
      updated++;
    }

    // Update partial items — reduce quantity and optionally recalculate price
    let partial = 0;
    const partialItems = items.filter((i) => i.stockStatus === "partial" && i.checkedQuantity != null);
    for (const item of partialItems) {
      let unitPrice = item.unitPrice;

      if (item.checkedPriceJpy != null) {
        const [card] = await tx.select().from(cards).where(eq(cards.id, item.cardId)).limit(1);
        if (card?.gbpJpyRate) {
          const newPrice = calculatePriceByCategory(item.checkedPriceJpy, card.gbpJpyRate, card.category);
          if (newPrice.price > 0 && (item.unitPrice === 0 || newPrice.price <= item.unitPrice * 10)) {
            unitPrice = newPrice.price;
          }
        }
      }

      const newQty = item.checkedQuantity!;
      const lineTotal = Math.round(unitPrice * newQty * 100) / 100;

      await tx.update(orderItems)
        .set({
          quantity: newQty,
          unitPrice: unitPrice,
          originalUnitPrice: item.originalUnitPrice ?? item.unitPrice,
          lineTotal,
        })
        .where(eq(orderItems.id, item.id));
      partial++;
    }

    // Recalculate order total from remaining (non-removed) items
    const remaining = await tx.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const total = Math.round(remaining.filter((i) => !i.removedAt).reduce((sum, i) => sum + i.lineTotal, 0) * 100) / 100;

    const now = new Date();
    const quotedExpiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    await tx.update(orders)
      .set({
        total,
        status: "quoted",
        stockCheckedAt: now,
        quotedAt: now,
        quotedExpiresAt,
        updatedAt: now,
      })
      .where(eq(orders.id, orderId));

    // Record status change in audit log
    await tx.insert(orderStatusHistory).values({
      orderId,
      fromStatus: "submitted",
      toStatus: "quoted",
      changedBy: parseInt(session.user.id),
      changedAt: now,
      note: `Stock check complete: ${removed} removed, ${updated} price updated, ${partial} partial`,
      itemsSnapshot: snapshot,
    });

    return { removedCount: removed, updatedCount: updated, partialCount: partial, newTotal: total };
  });

  // Send quote ready email to client
  try {
    await sendOrderEmail(orderId, "quote_ready");
  } catch {
    // Email failure should not break stock check completion
  }

  return NextResponse.json({
    success: true,
    removedCount,
    updatedCount,
    newTotal,
  });
}
