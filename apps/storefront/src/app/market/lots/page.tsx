"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface LotRow {
  id: string;
  title: string;
  price: string;
  image_url: string | null;
  status: string;
  seller_username: string | null;
  seller_name: string | null;
  item_count: number;
  total_quantity: number;
  created_at: string;
}

export default function MarketLotsPage() {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market/lots?limit=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setLots(d.lots || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">Bundles &amp; Lots</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Buy a whole playset, deck, or collection in one trade.
            </p>
          </div>
          <Link
            href="/account/lots"
            className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
          >
            List a lot
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : lots.length === 0 ? (
          <div className="bg-neutral-900 rounded-xl p-12 text-center">
            <p className="text-neutral-400 text-sm">No lots listed yet.</p>
            <p className="text-xs text-neutral-500 mt-2">
              Be the first. Bundle a deck, a playset, or a set completion and price it.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {lots.map((lot) => (
              <Link
                key={lot.id}
                href={`/market/lots/${lot.id}`}
                className="block bg-neutral-900 rounded-xl overflow-hidden hover:ring-2 hover:ring-amber-500/40 transition"
              >
                <div className="aspect-[4/3] bg-neutral-800">
                  {lot.image_url ? (
                    <img src={lot.image_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">
                      No image
                    </div>
                  )}
                </div>
                <div className="p-3">
                  <p className="text-sm font-bold text-white truncate">{lot.title}</p>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {lot.item_count} card{lot.item_count !== 1 ? "s" : ""} &middot; {lot.total_quantity} units
                  </p>
                  <div className="flex items-baseline justify-between mt-2">
                    <span className="text-base font-mono text-amber-400 font-bold">
                      {formatPrice(parseFloat(lot.price))}
                    </span>
                    {lot.seller_username && (
                      <span className="text-[11px] text-neutral-500">@{lot.seller_username}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
