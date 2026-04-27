import { db } from "@/lib/db";
import { orders, orderItems, cards, fulfillmentEntries } from "@/lib/db/schema";
import { eq, sql, isNull, inArray } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import OrderItemsTable from "./OrderItemsTable";

const statusSteps = ["submitted", "quoted", "confirmed", "paid", "ordered", "shipped", "delivered"];

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect("/login");

  const { id } = await params;
  const orderId = parseInt(id);
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) notFound();

  if (session.user.role !== "admin" && order.clientId !== parseInt(session.user.id)) {
    notFound();
  }

  const items = await db
    .select({
      id: orderItems.id,
      quantity: orderItems.quantity,
      unitPrice: orderItems.unitPrice,
      originalUnitPrice: orderItems.originalUnitPrice,
      lineTotal: orderItems.lineTotal,
      cardNumber: sql<string>`coalesce(${cards.cardNumber}, 'Unknown')`.as("card_number"),
      sku: sql<string>`coalesce(${cards.sku}, '—')`.as("sku"),
      imageUrl: cards.imageUrl,
    })
    .from(orderItems)
    .leftJoin(cards, eq(orderItems.cardId, cards.id))
    .where(sql`${orderItems.orderId} = ${orderId} AND ${orderItems.removedAt} IS NULL`);

  // Fulfillment data for confirmed+ orders
  const showFulfillment = ["confirmed", "paid", "ordered", "shipped", "delivered"].includes(order.status);
  let fulfilledMap: Record<number, number> | undefined;
  if (showFulfillment) {
    const fulfilledAgg = await db
      .select({
        orderItemId: fulfillmentEntries.orderItemId,
        total: sql<number>`sum(${fulfillmentEntries.fulfilledQty})`.as("total"),
      })
      .from(fulfillmentEntries)
      .where(eq(fulfillmentEntries.orderId, orderId))
      .groupBy(fulfillmentEntries.orderItemId);

    fulfilledMap = {};
    for (const row of fulfilledAgg) {
      fulfilledMap[row.orderItemId] = Number(row.total);
    }
  }

  const isCancelled = order.status === "cancelled";
  const currentIdx = isCancelled ? -1 : statusSteps.indexOf(order.status);
  const isQuoted = order.status === "quoted";
  const quoteExpired = isQuoted && order.quotedExpiresAt && order.quotedExpiresAt < new Date();

  // Volume discounts removed — total is the final price
  const preDiscountSubtotal = order.total;
  const discountAmount = 0;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-2 flex items-center gap-3">
          <h1 className="text-2xl font-bold">Order #{order.id}</h1>
          <StatusBadge status={order.status} />
        </div>
        <p className="mb-6 text-sm text-gray-400">
          Created {order.createdAt?.toLocaleString() ?? "\u2014"}
        </p>

        {/* Quote valid / expired banner */}
        {isQuoted && !quoteExpired && order.quotedExpiresAt && (
          <div className="mb-6 rounded-lg bg-yellow-900/20 border border-yellow-700/30 px-4 py-3 text-sm text-yellow-300">
            Quote valid until: {order.quotedExpiresAt!.toLocaleString()}. Contact us to confirm.
          </div>
        )}
        {isQuoted && quoteExpired && (
          <div className="mb-6 rounded-lg bg-red-900/20 border border-red-700/30 px-4 py-3 text-sm text-red-300">
            Quote expired — please resubmit or contact us.
          </div>
        )}

        {/* Status timeline */}
        {isCancelled ? (
          <div className="mb-8 rounded-lg bg-red-900/20 border border-red-700/30 px-4 py-3 text-sm text-red-300">
            This order has been cancelled.
          </div>
        ) : (
          <div className="mb-8 flex items-center gap-1 overflow-x-auto pb-2">
            {statusSteps.map((step, i) => (
              <div key={step} className="flex items-center flex-shrink-0">
                <div
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium ${
                    i <= currentIdx ? "bg-brand-600 text-white" : "bg-gray-800 text-gray-500"
                  }`}
                >
                  {step.charAt(0).toUpperCase() + step.slice(1)}
                </div>
                {i < statusSteps.length - 1 && (
                  <div className={`h-0.5 w-6 flex-shrink-0 ${i < currentIdx ? "bg-brand-600" : "bg-gray-800"}`} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Items table */}
          <OrderItemsTable items={items} fulfilledMap={fulfilledMap} />

          {/* Summary sidebar */}
          <div className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4 space-y-4">
            <h2 className="font-semibold">Summary</h2>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Subtotal</span>
                <span>&pound;{preDiscountSubtotal.toFixed(2)}</span>
              </div>

              <div className="border-t border-[#1e1e2e] pt-2 flex justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-green-400">&pound;{order.total.toFixed(2)}</span>
              </div>
            </div>

            {/* Quote expiry info */}
            {order.quotedAt && (
              <div className="border-t border-[#1e1e2e] pt-3 text-xs text-gray-500">
                Quoted on {order.quotedAt!.toLocaleString()}
              </div>
            )}

            {/* Notes */}
            {order.notes && (
              <div className="border-t border-[#1e1e2e] pt-3">
                <h3 className="text-sm font-medium text-gray-400 mb-1">Notes</h3>
                <p className="text-sm">{order.notes}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
