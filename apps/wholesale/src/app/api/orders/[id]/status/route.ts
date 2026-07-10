import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, clients, orderStatusHistory } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { isValidTransition, type OrderStatus } from "@/lib/order-transitions";
import { captureItemsSnapshot } from "@/lib/order-snapshot";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const orderId = parseInt(id);
  const body = await req.json() as {
    status?: string;
    items?: { id: number; unitPrice: number }[];
  };

  // Fetch current order
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  // Snapshot items BEFORE mutation for audit trail
  const snapshot = await captureItemsSnapshot(orderId);

  // Update line item prices if provided (for quote adjustments)
  if (body.items?.length) {
    for (const item of body.items) {
      const [lineItem] = await db.select().from(orderItems).where(eq(orderItems.id, item.id)).limit(1);
      if (!lineItem || lineItem.orderId !== orderId) continue;
      const lineTotal = Math.round(item.unitPrice * lineItem.quantity * 100) / 100;
      await db.update(orderItems)
        .set({ unitPrice: item.unitPrice, lineTotal })
        .where(eq(orderItems.id, item.id));
    }
    // Recalculate order total from non-removed items
    const allItems = await db.select().from(orderItems).where(eq(orderItems.orderId, orderId));
    const total = allItems.filter((i) => !i.removedAt).reduce((sum, i) => sum + i.lineTotal, 0);
    await db.update(orders)
      .set({ total: Math.round(total * 100) / 100, updatedAt: new Date() })
      .where(eq(orders.id, orderId));
  }

  // Update status if provided
  if (body.status) {
    const fromStatus = order.status as OrderStatus;
    const toStatus = body.status as OrderStatus;

    // Validate transition
    if (!isValidTransition(fromStatus, toStatus)) {
      return NextResponse.json({
        error: `Cannot transition from "${fromStatus}" to "${toStatus}"`,
      }, { status: 400 });
    }

    // Enforce quote expiry when confirming
    if (toStatus === "confirmed" && order.quotedExpiresAt && order.quotedExpiresAt < new Date()) {
      return NextResponse.json({
        error: "Quote has expired. Please request a new quote.",
      }, { status: 400 });
    }

    const now = new Date();
    const statusUpdate: Record<string, unknown> = {
      status: toStatus,
      updatedAt: now,
    };

    // Guard against concurrent/replayed PATCHes: the WHERE re-checks the status
    // read above, and the paid-spend increment only applies when this request
    // actually performed the transition — otherwise two PATCHes to "paid" would
    // both add order.total to currentMonthSpend.
    const transitioned = await db.transaction(async (tx) => {
      const updatedRows = await tx.update(orders)
        .set(statusUpdate)
        .where(and(eq(orders.id, orderId), eq(orders.status, fromStatus)))
        .returning({ id: orders.id });
      if (updatedRows.length === 0) return false;

      // When order becomes "paid", add its total to client's currentMonthSpend
      if (toStatus === "paid") {
        await tx.update(clients)
          .set({ currentMonthSpend: sql`current_month_spend + ${order.total}` })
          .where(eq(clients.id, order.clientId));
      }
      return true;
    });

    if (!transitioned) {
      return NextResponse.json({
        error: `Order is no longer in "${fromStatus}" status`,
      }, { status: 409 });
    }

    // Record status change in audit log (non-fatal — table may not exist yet)
    try {
      await db.insert(orderStatusHistory).values({
        orderId,
        fromStatus,
        toStatus,
        changedBy: parseInt(session.user.id),
        changedAt: now,
        itemsSnapshot: snapshot,
      });
    } catch {
      // Audit log failure should not block status update
    }

    // Send notification email for key status transitions
    const emailMap: Record<string, "quote_ready" | "confirmed" | "shipped" | "delivered"> = {
      confirmed: "confirmed",
      shipped: "shipped",
      delivered: "delivered",
    };
    const emailType = emailMap[toStatus];
    if (emailType) {
      try {
        await sendOrderEmail(orderId, emailType);
      } catch {
        // Email failure should not break status update
      }
    }
  }

  const [updated] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  return NextResponse.json(updated);
}
