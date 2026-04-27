import { eq, sql } from "drizzle-orm";
import { clients, orders } from "@/lib/db/schema";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * Atomically increments the client's order sequence and returns a formatted
 * order number like "CTCG-007". Returns null if the client has no orderPrefix.
 */
export async function assignClientOrderNumber(
  tx: PgTransaction<any, any, any>,
  clientId: number,
  orderId: number,
): Promise<string | null> {
  // Atomically increment and return the new sequence value
  const [updated] = await tx
    .update(clients)
    .set({ orderSequence: sql`${clients.orderSequence} + 1` })
    .where(eq(clients.id, clientId))
    .returning({ prefix: clients.orderPrefix, seq: clients.orderSequence });

  if (!updated?.prefix) return null;

  const orderNumber = `${updated.prefix}-${updated.seq.toString().padStart(3, "0")}`;

  await tx
    .update(orders)
    .set({ clientOrderNumber: orderNumber })
    .where(eq(orders.id, orderId));

  return orderNumber;
}
