import { db } from "@/lib/db";
import { orders, orderItems, cards } from "@/lib/db/schema";
import { eq, sql, desc, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import MarginCalculator from "./MarginCalculator";

const FULFILLED_STATUSES = ["paid", "ordered", "shipped", "delivered"] as const;

export default async function MarginPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const clientId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  // Fetch orders that have been paid/fulfilled
  const clientOrders = isAdmin
    ? await db
        .select()
        .from(orders)
        .where(inArray(orders.status, [...FULFILLED_STATUSES]))
        .orderBy(desc(orders.createdAt))
    : await db
        .select()
        .from(orders)
        .where(
          sql`${orders.clientId} = ${clientId} AND ${orders.status} IN ('paid', 'ordered', 'shipped', 'delivered')`,
        )
        .orderBy(desc(orders.createdAt));

  if (clientOrders.length === 0) {
    return (
      <>
        <Nav />
        <main className="mx-auto max-w-7xl px-6 py-8">
          <h1 className="text-2xl font-bold mb-6">Profit Margin Calculator</h1>
          <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-8 text-center">
            <p className="text-gray-400">No fulfilled orders yet. Once an order is paid, you can calculate your margins here.</p>
          </div>
        </main>
      </>
    );
  }

  const orderIds = clientOrders.map((o) => o.id);

  // Fetch all items for these orders
  const allItems = await db
    .select({
      id: orderItems.id,
      orderId: orderItems.orderId,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      cardName: sql<string>`coalesce(${cards.name}, '')`.as("card_name"),
      sku: sql<string>`coalesce(${cards.sku}, '—')`.as("sku"),
      imageUrl: cards.imageUrl,
    })
    .from(orderItems)
    .leftJoin(cards, eq(orderItems.cardId, cards.id))
    .where(
      sql`${orderItems.orderId} IN (${sql.join(orderIds.map((id) => sql`${id}`), sql`, `)}) AND ${orderItems.removedAt} IS NULL`,
    );

  // Group items by order
  const itemsByOrder: Record<number, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByOrder[item.orderId]) itemsByOrder[item.orderId] = [];
    itemsByOrder[item.orderId].push(item);
  }

  const ordersData = clientOrders.map((o) => ({
    id: o.id,
    status: o.status,
    total: o.total,
    createdAt: o.createdAt?.toISOString() ?? null,
    items: (itemsByOrder[o.id] ?? []).map((i) => ({
      id: i.id,
      cardNumber: i.cardNumber,
      cardName: i.cardName,
      sku: i.sku,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      lineTotal: i.lineTotal,
      imageUrl: i.imageUrl,
    })),
  }));

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <h1 className="text-2xl font-bold mb-2">Profit Margin Calculator</h1>
        <p className="text-sm text-gray-400 mb-6">
          Enter your selling prices to calculate profit on each item.
        </p>
        <MarginCalculator orders={ordersData} />
      </main>
    </>
  );
}
