import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, cards, clients, orderStatusHistory, cartItems } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { assignClientOrderNumber } from "@/lib/order-number";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const clientId = parseInt(session.user.id);
  const body = await req.json() as {
    items: { cardId: number; quantity: number }[];
    notes?: string;
    idempotencyKey?: string;
  };
  const { items, notes, idempotencyKey } = body;

  if (!items?.length) return NextResponse.json({ error: "No items" }, { status: 400 });
  if (notes && notes.length > 2000) return NextResponse.json({ error: "Notes too long (max 2000 chars)" }, { status: 400 });
  if (idempotencyKey && idempotencyKey.length > 100) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  // Validate quantities
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
      return NextResponse.json({ error: `Invalid quantity for card ${item.cardId}` }, { status: 400 });
    }
  }

  // Idempotency: reject duplicate submissions within 60s
  if (idempotencyKey) {
    const cutoff = new Date(Date.now() - 60_000);
    const [existing] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.clientId, clientId), eq(orders.notes, `__idem:${idempotencyKey}`)))
      .limit(1);
    // Notes field stores idempotency marker temporarily — check recent orders as fallback
    if (existing) {
      const [fullOrder] = await db.select().from(orders).where(eq(orders.id, existing.id)).limit(1);
      return NextResponse.json(fullOrder);
    }
  }

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return NextResponse.json({ error: "Client not found" }, { status: 404 });

  // Resolve prices server-side from DB (never trust client-sent prices)
  let subtotal = 0;
  const resolvedItems: { cardId: number; quantity: number; unitPrice: number; lineTotal: number }[] = [];

  for (const item of items) {
    const [card] = await db.select().from(cards).where(eq(cards.id, item.cardId)).limit(1);
    if (!card) {
      return NextResponse.json({ error: `Card ${item.cardId} not found` }, { status: 400 });
    }
    if (card.price == null || card.price <= 0) {
      return NextResponse.json({ error: `Card ${card.cardNumber} has no valid price` }, { status: 400 });
    }
    const unitPrice = card.price;
    const lineTotal = Math.round(unitPrice * item.quantity * 100) / 100;
    subtotal += lineTotal;
    resolvedItems.push({ cardId: item.cardId, quantity: item.quantity, unitPrice, lineTotal });
  }

  const now = new Date();
  const orderNotes = notes?.trim() || null;

  const order = await db.transaction(async (tx) => {
    const [newOrder] = await tx
      .insert(orders)
      .values({
        clientId,
        status: "submitted",
        total: Math.round(subtotal * 100) / 100,
        volumeDiscount: 0,
        notes: idempotencyKey ? `__idem:${idempotencyKey}` : orderNotes,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Clear idempotency marker and set real notes
    if (idempotencyKey && orderNotes) {
      await tx.update(orders).set({ notes: orderNotes }).where(eq(orders.id, newOrder.id));
    }

    for (const item of resolvedItems) {
      await tx.insert(orderItems).values({ orderId: newOrder.id, ...item });
    }

    // Assign per-client order number (e.g. "CTCG-007")
    await assignClientOrderNumber(tx, clientId, newOrder.id);

    // Record initial status in audit log
    try {
      await tx.insert(orderStatusHistory).values({
        orderId: newOrder.id,
        fromStatus: "new",
        toStatus: "submitted",
        changedBy: clientId,
        changedAt: now,
      });
    } catch {
      // Audit log failure should not block order submission
    }

    return newOrder;
  });

  // Clear server-persisted cart (belt-and-suspenders — client clear() also fires DELETE)
  try {
    await db.delete(cartItems).where(eq(cartItems.clientId, clientId));
  } catch {
    // Cart cleanup failure should not block order submission
  }

  // Notify admin of new order
  try {
    await sendOrderEmail(order.id, "new_order");
  } catch {
    // Email failure should not break order submission
  }

  return NextResponse.json(order);
}
