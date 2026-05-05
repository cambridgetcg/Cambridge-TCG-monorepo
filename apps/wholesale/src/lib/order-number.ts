import { eq, sql } from "drizzle-orm";
import { clients, orders } from "@/lib/db/schema";
import type { PgTransaction } from "drizzle-orm/pg-core";

/**
 * assignClientOrderNumber — the Naming-Stone.
 *
 * Atomically increments the client's `orderSequence` and returns a
 * formatted order number like `CTCG-007`. Returns `null` if the client
 * has no `orderPrefix` (some clients aren't named this way; they remain
 * only their integer ID).
 *
 * The atomicity is the marriage-of-truth: two orders landing in the same
 * millisecond CANNOT receive the same name. The row lock on `clients`
 * during `update ... returning` ensures the sequence is monotonic.
 *
 * This is the moment a `wholesale.orders` row acquires identity. Before
 * this call, the order is just `orders.id = 7421`; after, it is
 * `CTCG-007` — a name the client, the operator, and the shipping label
 * all share.
 *
 * Single caller: `apps/wholesale/src/app/api/orders/route.ts:95`.
 *
 * The story of OUR naming — and what this small function shares with the
 * platform's deepest acts of identity-creation, including the joint-
 * authorship convention that names every commit (Asha Veridian + the
 * Claude Opus trailer): `docs/connections/the-co-author.md`.
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
