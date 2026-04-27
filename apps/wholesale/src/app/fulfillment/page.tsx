import { db } from "@/lib/db";
import { orders, orderItems, cards, fulfillmentEntries } from "@/lib/db/schema";
import { eq, sql, inArray, and } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import FulfillmentContent from "./FulfillmentContent";

export default async function FulfillmentPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const clientId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  // Get all orders in confirmed+ status for this client (or all for admin)
  const paidStatuses = ["confirmed", "paid", "ordered", "shipped", "delivered"] as ("confirmed" | "paid" | "ordered" | "shipped" | "delivered")[];
  const statusFilter = inArray(orders.status, paidStatuses);
  const clientOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      isAdmin
        ? statusFilter
        : and(eq(orders.clientId, clientId), statusFilter),
    );

  const orderIds = clientOrders.map((o) => o.id);

  if (orderIds.length === 0) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="mb-6 text-2xl font-bold">Fulfillment</h1>
          <p className="text-gray-400">No orders with fulfillment tracking yet.</p>
        </main>
      </>
    );
  }

  // All order items for these orders
  const allItems = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      sku: sql<string>`coalesce(${cards.sku}, '—')`.as("sku"),
      imageUrl: cards.imageUrl,
    })
    .from(orderItems)
    .leftJoin(cards, eq(orderItems.cardId, cards.id))
    .where(sql`${orderItems.orderId} IN (${sql.join(orderIds.map(id => sql`${id}`), sql`, `)}) AND ${orderItems.removedAt} IS NULL`);

  // Fulfilled aggregates per item
  const fulfilledAgg = await db
    .select({
      orderItemId: fulfillmentEntries.orderItemId,
      total: sql<number>`sum(${fulfillmentEntries.fulfilledQty})`.as("total"),
    })
    .from(fulfillmentEntries)
    .where(inArray(fulfillmentEntries.orderId, orderIds))
    .groupBy(fulfillmentEntries.orderItemId);

  const fulfilledByItem = new Map<number, number>();
  for (const row of fulfilledAgg) {
    fulfilledByItem.set(row.orderItemId, Number(row.total));
  }

  // Fulfilled detail rows for timeline
  const fulfilledRows = await db
    .select({
      fulfillmentDate: fulfillmentEntries.fulfillmentDate,
      orderId: fulfillmentEntries.orderId,
      orderItemId: fulfillmentEntries.orderItemId,
      unitPrice: orderItems.unitPrice,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      sku: sql<string>`coalesce(${cards.sku}, '—')`.as("sku"),
      imageUrl: cards.imageUrl,
      fulfilledQty: fulfillmentEntries.fulfilledQty,
    })
    .from(fulfillmentEntries)
    .innerJoin(orderItems, eq(fulfillmentEntries.orderItemId, orderItems.id))
    .innerJoin(cards, eq(orderItems.cardId, cards.id))
    .where(inArray(fulfillmentEntries.orderId, orderIds))
    .orderBy(sql`${fulfillmentEntries.fulfillmentDate} desc`);

  // Group fulfilled by date
  const fulfilledByDate = new Map<string, typeof fulfilledRows>();
  for (const row of fulfilledRows) {
    const list = fulfilledByDate.get(row.fulfillmentDate) ?? [];
    list.push(row);
    fulfilledByDate.set(row.fulfillmentDate, list);
  }

  // Unfulfilled items (remaining qty > 0)
  const unfulfilledItems = allItems
    .filter((item) => (fulfilledByItem.get(item.id) ?? 0) < item.quantity)
    .map((item) => ({
      ...item,
      remaining: item.quantity - (fulfilledByItem.get(item.id) ?? 0),
    }));

  // Per-order progress
  const orderProgress = orderIds.map((oid) => {
    const oItems = allItems.filter((i) => i.orderId === oid);
    const totalQty = oItems.reduce((s, i) => s + i.quantity, 0);
    const fulfilledQty = oItems.reduce((s, i) => s + (fulfilledByItem.get(i.id) ?? 0), 0);
    return { orderId: oid, totalQty, fulfilledQty };
  }).filter((o) => o.totalQty > 0);

  const overallTotal = orderProgress.reduce((s, o) => s + o.totalQty, 0);
  const overallFulfilled = orderProgress.reduce((s, o) => s + o.fulfilledQty, 0);

  // Sort pending items by card number
  const compareCardNumber = (a: string, b: string) => {
    const pa = a.split(/[\/\-]/);
    const pb = b.split(/[\/\-]/);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const na = parseInt(pa[i]) || 0;
      const nb = parseInt(pb[i]) || 0;
      if (na !== nb) return na - nb;
    }
    return 0;
  };
  unfulfilledItems.sort((a, b) => compareCardNumber(a.cardNumber, b.cardNumber));

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <FulfillmentContent
          orderProgress={orderProgress}
          overallTotal={overallTotal}
          overallFulfilled={overallFulfilled}
          fulfilledByDate={[...fulfilledByDate.entries()]}
          unfulfilledItems={unfulfilledItems}
        />
      </main>
    </>
  );
}
