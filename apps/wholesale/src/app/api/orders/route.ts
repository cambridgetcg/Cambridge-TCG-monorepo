import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { orders, orderItems, cards, clients, orderStatusHistory, cartItems } from "@/lib/db/schema";
import { eq, and, gte, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { sendOrderEmail } from "@/lib/email/send-order-email";
import { assignClientOrderNumber } from "@/lib/order-number";

// The idempotency marker rides as the first line of `notes` (no dedicated
// key column yet); strip it before the order leaves the API.
function withoutIdemMarker<T extends { notes: string | null }>(order: T): T {
  if (!order.notes?.startsWith("__idem:")) return order;
  const nl = order.notes.indexOf("\n");
  return { ...order, notes: nl === -1 ? null : order.notes.slice(nl + 1) };
}

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

  const idemMarker = idempotencyKey ? `__idem:${idempotencyKey}` : null;

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

  const { order, replayed } = await db.transaction(async (tx) => {
    // Idempotency: reject duplicate submissions within 60s. There is no
    // unique constraint to lean on, so the check-then-insert is serialized
    // per (client, key) with an advisory lock scoped to this transaction.
    if (idemMarker) {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${clientId}:${idemMarker}`}))`);
      const cutoff = new Date(Date.now() - 60_000);
      const [existing] = await tx
        .select()
        .from(orders)
        .where(and(
          eq(orders.clientId, clientId),
          gte(orders.createdAt, cutoff),
          sql`split_part(${orders.notes}, chr(10), 1) = ${idemMarker}`,
        ))
        .limit(1);
      if (existing) return { order: existing, replayed: true };
    }

    const [newOrder] = await tx
      .insert(orders)
      .values({
        clientId,
        status: "submitted",
        total: Math.round(subtotal * 100) / 100,
        volumeDiscount: 0,
        notes: idemMarker ? (orderNotes ? `${idemMarker}\n${orderNotes}` : idemMarker) : orderNotes,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

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

    return { order: newOrder, replayed: false };
  });

  if (!replayed) {
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
  }

  return NextResponse.json(withoutIdemMarker(order));
}
