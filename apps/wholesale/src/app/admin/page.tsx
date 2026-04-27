import { db } from "@/lib/db";
import { orders, clients, cards } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import Link from "next/link";

export default async function AdminDashboard() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const allOrders = await db.select().from(orders);
  const activeClients = await db.select().from(clients).where(eq(clients.role, "client"));

  const pendingOrders = allOrders.filter((o) => o.status === "submitted");
  const pendingTotal = pendingOrders.reduce((sum, o) => sum + o.total, 0);

  const monthRevenue = allOrders
    .filter((o) =>
      ["paid", "ordered", "shipped", "delivered"].includes(o.status) &&
      o.createdAt != null && o.createdAt >= monthStart
    )
    .reduce((sum, o) => sum + o.total, 0);

  const lastSync = await db
    .select({ lastSyncedAt: cards.lastSyncedAt })
    .from(cards)
    .orderBy(sql`${cards.lastSyncedAt} DESC`)
    .limit(1);
  const lastSyncTime = lastSync[0]?.lastSyncedAt;

  const stats = [
    { label: "Pending Orders", value: pendingOrders.length, sub: `£${pendingTotal.toFixed(2)} total` },
    { label: "This Month Revenue", value: `£${monthRevenue.toFixed(2)}`, sub: "inc. VAT" },
    { label: "Active Clients", value: activeClients.length, sub: null },
    { label: "Last Price Sync", value: lastSyncTime ? lastSyncTime.toLocaleDateString() : "Never", sub: lastSyncTime ? lastSyncTime.toLocaleTimeString() : null },
  ];

  const links = [
    { href: "/admin/orders", label: "Manage Orders", desc: "View and process all orders" },
    { href: "/admin/prices", label: "Price Management", desc: "Sync prices, upload CSV, edit overrides" },
    { href: "/admin/clients", label: "Client Management", desc: "Add clients, manage discounts" },
    { href: "/admin/stock-levels", label: "Stock Levels", desc: "View and adjust stock per card" },
    { href: "/admin/stock-targets", label: "Stock Targets", desc: "Set target stock levels by price tier" },
    { href: "/admin/to-order", label: "To Order", desc: "Cards needing purchase from supplier" },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4">
            <p className="text-sm text-gray-400">{stat.label}</p>
            <p className="mt-1 text-2xl font-bold text-brand-500">{stat.value}</p>
            {stat.sub && <p className="mt-0.5 text-xs text-gray-500">{stat.sub}</p>}
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-lg border border-[#1e1e2e] bg-[#12121a] p-4 hover:border-brand-500/50 transition"
          >
            <h3 className="font-semibold text-brand-500">{link.label}</h3>
            <p className="mt-1 text-sm text-gray-400">{link.desc}</p>
          </Link>
        ))}
      </div>

      {pendingOrders.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-4 text-lg font-semibold">Pending Orders</h2>
          <div className="space-y-2">
            {pendingOrders.map((order) => (
              <Link
                key={order.id}
                href="/admin/orders"
                className="flex items-center justify-between rounded-lg border border-[#1e1e2e] bg-[#12121a] p-3 hover:border-brand-500/50 transition"
              >
                <span>Order #{order.id}</span>
                <span className="text-sm text-gray-400">{order.status}</span>
                <span className="font-medium text-green-400">£{order.total.toFixed(2)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
