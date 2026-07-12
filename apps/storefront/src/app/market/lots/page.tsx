"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmptyState, Icon, Money } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";

interface LotRow {
  id: string;
  title: string;
  price: string;
  image_url: string | null;
  status: string;
  item_count: number;
  total_quantity: number;
  created_at: string;
}

export default function MarketLotsPage() {
  const [lots, setLots] = useState<LotRow[]>([]);
  const [loading, setLoading] = useState(true);
  const v = useVoice();

  useEffect(() => {
    fetch("/api/market/lots?limit=48")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setLots(d.lots || []); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Wardrobe migration (spec §3.4): Gallery tokens, framed lots, mono numerals — behaviour unchanged.
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-ink">{v("market.lots.title")}</h1>
          <p className="text-sm text-ink-muted mt-1">
            {v("market.lots.subtitle")}
          </p>
        </div>
        <Link
          href="/account/lots"
          className="px-4 py-2 bg-ink text-page text-sm font-semibold rounded-lg hover:opacity-90 transition"
        >
          List a lot
        </Link>
      </div>

      {loading ? (
        <p className="text-sm text-ink-faint">Loading...</p>
      ) : lots.length === 0 ? (
        <EmptyState
          title={v("market.lots.empty.title")}
          description={v("market.lots.empty.description")}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {lots.map((lot) => (
            <div
              key={lot.id}
              className="wardrobe-mat rounded-lg overflow-hidden hover:ring-2 hover:ring-accent/40 transition"
            >
              <Link href={`/market/lots/${lot.id}`} className="block">
                <div className="aspect-[4/3] p-1">
                  {lot.image_url ? (
                    <img src={lot.image_url} alt="" className="w-full h-full object-cover rounded border border-border-subtle" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center rounded border border-border-subtle bg-surface-subtle text-ink-faint">
                      <Icon name="lots" size={28} />
                    </div>
                  )}
                </div>
                <div className="px-3 pt-3">
                  <p className="text-sm font-semibold text-ink truncate">{lot.title}</p>
                  <p className="text-[11px] font-mono tabular-nums text-ink-faint mt-0.5">
                    {lot.item_count} card{lot.item_count !== 1 ? "s" : ""} &middot; {lot.total_quantity} units
                  </p>
                  <p className="text-base font-mono tabular-nums text-ink font-bold mt-2">
                    <Money value={parseFloat(lot.price)} />
                  </p>
                </div>
              </Link>
              <p className="px-3 pb-3 pt-1 text-[11px] text-ink-faint">
                Seller identity withheld
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
