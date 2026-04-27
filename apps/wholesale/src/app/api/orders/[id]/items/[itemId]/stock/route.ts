import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orderItems, orders } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";

const validStatuses = ["pending", "in_stock", "out_of_stock", "price_changed", "partial"] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, itemId } = await params;
  const orderId = parseInt(id);
  const orderItemId = parseInt(itemId);

  // Verify order exists and is submitted
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }
  if (order.status !== "submitted") {
    return NextResponse.json({ error: "Order must be in submitted status" }, { status: 400 });
  }

  // Verify item belongs to this order
  const [item] = await db
    .select()
    .from(orderItems)
    .where(and(eq(orderItems.id, orderItemId), eq(orderItems.orderId, orderId)))
    .limit(1);
  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  const body = await req.json() as {
    stockStatus: string;
    checkedPriceJpy?: number;
    checkedQuantity?: number;
  };

  if (!validStatuses.includes(body.stockStatus as typeof validStatuses[number])) {
    return NextResponse.json({ error: "Invalid stock status" }, { status: 400 });
  }

  if (body.stockStatus === "partial") {
    if (body.checkedQuantity == null || body.checkedQuantity < 1) {
      return NextResponse.json({ error: "Partial status requires checkedQuantity >= 1" }, { status: 400 });
    }
    if (body.checkedQuantity >= item.quantity) {
      return NextResponse.json({ error: "Partial quantity must be less than ordered quantity" }, { status: 400 });
    }
  }

  const update: Record<string, unknown> = {
    stockStatus: body.stockStatus,
  };

  // Only store checkedPriceJpy when status is price_changed or partial
  if ((body.stockStatus === "price_changed" || body.stockStatus === "partial") && body.checkedPriceJpy != null) {
    update.checkedPriceJpy = body.checkedPriceJpy;
  } else {
    update.checkedPriceJpy = null;
  }

  // Only store checkedQuantity when status is partial
  if (body.stockStatus === "partial" && body.checkedQuantity != null) {
    update.checkedQuantity = body.checkedQuantity;
  } else {
    update.checkedQuantity = null;
  }

  await db.update(orderItems).set(update).where(eq(orderItems.id, orderItemId));

  const [updated] = await db.select().from(orderItems).where(eq(orderItems.id, orderItemId)).limit(1);
  return NextResponse.json({ success: true, item: updated });
}
