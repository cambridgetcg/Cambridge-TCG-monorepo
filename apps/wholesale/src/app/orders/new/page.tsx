import Link from "next/link";
import Nav from "@/components/Nav";
import { NEW_ORDERS_RETIRED_MESSAGE } from "@/lib/commercial-retirement";

export default function NewOrderPage() {
  return <>
    <Nav />
    <main className="mx-auto max-w-7xl px-6 py-8">
      <h1 className="mb-6 text-2xl font-bold">New ordering is retired</h1>
      <p className="mb-6 text-gray-400">{NEW_ORDERS_RETIRED_MESSAGE}</p>
      <div className="flex gap-6">
        <Link href="/orders" className="text-brand-500">View existing orders</Link>
        <Link href="/catalog" className="text-brand-500">Explore price records</Link>
      </div>
    </main>
  </>;
}
