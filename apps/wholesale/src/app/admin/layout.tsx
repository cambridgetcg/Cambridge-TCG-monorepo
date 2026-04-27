import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Nav from "@/components/Nav";
import Link from "next/link";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session || session.user.role !== "admin") redirect("/catalog");

  return (
    <>
      <Nav />
      <div className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex gap-4 border-b border-[#1e1e2e] pb-4">
          <Link href="/admin" className="text-sm hover:text-brand-500 transition">Dashboard</Link>
          <Link href="/admin/orders" className="text-sm hover:text-brand-500 transition">Orders</Link>
          <Link href="/admin/prices" className="text-sm hover:text-brand-500 transition">Prices</Link>
          <Link href="/admin/games" className="text-sm hover:text-brand-500 transition">Games</Link>
          <Link href="/admin/clients" className="text-sm hover:text-brand-500 transition">Clients</Link>
          <Link href="/admin/stock" className="text-sm hover:text-brand-500 transition">Stock</Link>
          <Link href="/admin/stock-levels" className="text-sm hover:text-brand-500 transition">Levels</Link>
          <Link href="/admin/stock-adjustments" className="text-sm hover:text-brand-500 transition">Adjustments</Link>
          <Link href="/admin/stock-targets" className="text-sm hover:text-brand-500 transition">Targets</Link>
          <Link href="/admin/to-order" className="text-sm hover:text-brand-500 transition">To Order</Link>
          <Link href="/admin/refill" className="text-sm hover:text-brand-500 transition">Refill</Link>
          <Link href="/admin/purchases" className="text-sm hover:text-brand-500 transition">Purchases</Link>
          <Link href="/admin/wanted" className="text-sm hover:text-brand-500 transition">Wanted</Link>
          <Link href="/admin/channel-pricing" className="text-sm hover:text-brand-500 transition">Channels</Link>
        </div>
        {children}
      </div>
    </>
  );
}
