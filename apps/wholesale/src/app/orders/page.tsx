import { db } from "@/lib/db";
import { orders, orderItems } from "@/lib/db/schema";
import { eq, desc, count, sql, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";

export default async function OrdersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const clientId = parseInt(session.user.id);
  const isAdmin = session.user.role === "admin";

  // Subquery for item counts
  const itemCounts = db
    .select({
      orderId: orderItems.orderId,
      itemCount: count(orderItems.id).as("item_count"),
    })
    .from(orderItems)
    .where(isNull(orderItems.removedAt))
    .groupBy(orderItems.orderId)
    .as("item_counts");

  const baseQuery = db
    .select({
      id: orders.id,
      status: orders.status,
      total: orders.total,
      createdAt: orders.createdAt,
      clientId: orders.clientId,
      itemCount: sql<number>`coalesce(${itemCounts.itemCount}, 0)`.as("item_count"),
    })
    .from(orders)
    .leftJoin(itemCounts, eq(orders.id, itemCounts.orderId))
    .orderBy(desc(orders.createdAt));

  const allOrders = isAdmin
    ? await baseQuery
    : await baseQuery.where(eq(orders.clientId, clientId));

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Orders</h1>
          <Link
            href="/orders/new"
            className="rounded bg-brand-600 px-4 py-2 text-sm font-medium hover:bg-brand-700 transition"
          >
            New Order
          </Link>
        </div>

        <div className="overflow-x-auto rounded-lg border border-[#1e1e2e]">
          <table className="w-full text-sm">
            <thead className="bg-[#12121a]">
              <tr className="text-left text-gray-400">
                <th className="px-2 md:px-4 py-3 font-medium">Order #</th>
                <th className="hidden md:table-cell px-4 py-3 font-medium">Date</th>
                <th className="hidden md:table-cell px-4 py-3 font-medium text-right">Items</th>
                <th className="px-2 md:px-4 py-3 font-medium text-right">Total</th>
                <th className="px-2 md:px-4 py-3 font-medium">Status</th>
                <th className="hidden md:table-cell px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {allOrders.map((order) => (
                <tr key={order.id} className="hover:bg-[#12121a] transition">
                  <td className="px-2 md:px-4 py-3">
                    <Link href={`/orders/${order.id}`} className="text-brand-500 hover:underline">
                      #{order.id}
                    </Link>
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-gray-400">
                    {order.createdAt?.toLocaleDateString() ?? "\u2014"}
                  </td>
                  <td className="hidden md:table-cell px-4 py-3 text-right text-gray-400">{order.itemCount}</td>
                  <td className="px-2 md:px-4 py-3 text-right font-medium">
                    &pound;{order.total.toFixed(2)}
                  </td>
                  <td className="px-2 md:px-4 py-3"><StatusBadge status={order.status} /></td>
                  <td className="hidden md:table-cell px-4 py-3 text-right">
                    <Link
                      href={`/orders/${order.id}`}
                      className="text-brand-500 hover:underline text-xs"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {allOrders.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No orders yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
