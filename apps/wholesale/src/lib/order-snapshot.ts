import { db } from "@/lib/db";
import { orderItems, cards } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";

export interface ItemSnapshot {
  id: number;
  cardId: number;
  cardNumber: string;
  quantity: number;
  unitPrice: number;
  originalUnitPrice: number | null;
  lineTotal: number;
  stockStatus: string;
  removedAt: string | null;
}

/**
 * Capture a snapshot of all order items (including soft-deleted) for audit trail.
 * Stored as JSON in order_status_history.items_snapshot.
 */
export async function captureItemsSnapshot(orderId: number): Promise<ItemSnapshot[]> {
  const items = await db
    .select({
      id: orderItems.id,
      cardId: orderItems.cardId,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      originalUnitPrice: orderItems.originalUnitPrice,
      lineTotal: orderItems.lineTotal,
      stockStatus: orderItems.stockStatus,
      removedAt: orderItems.removedAt,
    })
    .from(orderItems)
    .leftJoin(cards, eq(orderItems.cardId, cards.id))
    .where(eq(orderItems.orderId, orderId));

  return items.map((i) => ({
    id: i.id,
    cardId: i.cardId,
    cardNumber: i.cardNumber,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    originalUnitPrice: i.originalUnitPrice,
    lineTotal: i.lineTotal,
    stockStatus: i.stockStatus,
    removedAt: i.removedAt?.toISOString() ?? null,
  }));
}
