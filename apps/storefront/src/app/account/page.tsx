"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface User {
  name: string | null;
  email: string;
  image: string | null;
}

export default function AccountPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [orderCount, setOrderCount] = useState(0);
  const [tradeInCount, setTradeInCount] = useState(0);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }
        setUser(data.user);
        setLoading(false);

        // Fetch counts
        fetch("/api/account/orders")
          .then((r) => r.json())
          .then((d) => setOrderCount(d.orders?.length || 0));
        fetch("/api/account/trade-ins")
          .then((r) => r.json())
          .then((d) => setTradeInCount(d.submissions?.length || 0));
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold text-white mb-2">My Account</h1>
        <p className="text-neutral-400 mb-8">{user?.email}</p>

        <div className="grid gap-4">
          <Link
            href="/account/orders"
            className="bg-neutral-900 rounded-xl p-5 hover:bg-neutral-800/70 transition group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition">Orders</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  {orderCount === 0 ? "No orders yet" : `${orderCount} order${orderCount !== 1 ? "s" : ""}`}
                </p>
              </div>
              <span className="text-neutral-600 group-hover:text-neutral-400 transition text-lg">&rarr;</span>
            </div>
          </Link>

          <Link
            href="/account/trade-ins"
            className="bg-neutral-900 rounded-xl p-5 hover:bg-neutral-800/70 transition group"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition">Trade-Ins</h2>
                <p className="text-sm text-neutral-400 mt-1">
                  {tradeInCount === 0 ? "No trade-ins yet" : `${tradeInCount} submission${tradeInCount !== 1 ? "s" : ""}`}
                </p>
              </div>
              <span className="text-neutral-600 group-hover:text-neutral-400 transition text-lg">&rarr;</span>
            </div>
          </Link>

          {/* Future: membership card */}
          <div className="bg-neutral-900/50 rounded-xl p-5 border border-dashed border-neutral-800">
            <h2 className="text-lg font-bold text-neutral-600">Membership</h2>
            <p className="text-sm text-neutral-600 mt-1">Coming soon</p>
          </div>
        </div>

        <button
          onClick={() => {
            fetch("/api/auth/signout", { method: "POST" }).then(() => router.push("/"));
          }}
          className="mt-8 text-sm text-neutral-500 hover:text-red-400 transition"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
