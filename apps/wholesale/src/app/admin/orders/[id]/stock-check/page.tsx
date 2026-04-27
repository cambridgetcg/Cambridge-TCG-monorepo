import { db } from "@/lib/db";
import { orders, orderItems, cards, clients } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { calculatePriceByCategory } from "@/lib/pricing";
import StockCheckClient from "./StockCheckClient";

export default async function StockCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/catalog");

  const { id } = await params;
  const orderId = parseInt(id);

  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) redirect("/admin/orders");
  if (order.status !== "submitted") redirect("/admin/orders");

  const [client] = await db.select().from(clients).where(eq(clients.id, order.clientId)).limit(1);

  const items = await db
    .select({
      id: orderItems.id,
      cardId: orderItems.cardId,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      imageUrl: cards.imageUrl,
      cardrushUrl: cards.cardrushUrl,
      cardrushJpy: cards.cardrushJpy,
      gbpJpyRate: cards.gbpJpyRate,
      category: cards.category,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      lineTotal: orderItems.lineTotal,
      stockStatus: orderItems.stockStatus,
      checkedPriceJpy: orderItems.checkedPriceJpy,
      checkedQuantity: orderItems.checkedQuantity,
    })
    .from(orderItems)
    .leftJoin(cards, eq(orderItems.cardId, cards.id))
    .where(sql`${orderItems.orderId} = ${orderId} AND ${orderItems.removedAt} IS NULL`);

  // Calculate price discrepancies
  const itemsWithDiscrepancy = items.map((item) => {
    let priceDiffPct: number | null = null;
    let currentCalcPrice: number | null = null;
    if (item.cardrushJpy && item.gbpJpyRate) {
      const current = calculatePriceByCategory(item.cardrushJpy, item.gbpJpyRate, item.category);
      currentCalcPrice = current.price;
      const diff = Math.abs(current.price - item.unitPrice) / item.unitPrice;
      if (diff > 0.05) priceDiffPct = diff;
    }
    return { ...item, priceDiffPct, currentCalcPrice };
  });

  return (
    <div>
      <StockCheckClient
        orderId={orderId}
        clientName={client?.name ?? `Client #${order.clientId}`}
        clientCompany={client?.company ?? null}
        orderTotal={order.total}
        items={itemsWithDiscrepancy}
      />
    </div>
  );
}
