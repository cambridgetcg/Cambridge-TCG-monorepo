"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface SellerOrBuyer {
  username: string; name: string | null;
  tradeCount: number; volumeGbp: number;
}
interface BusySku {
  sku: string; cardName: string | null; imageUrl: string | null;
  tradeCount: number; volume: number; avgPrice: number;
}

const WINDOWS = [
  { value: 7,  label: "7d" },
  { value: 30, label: "30d" },
  { value: 90, label: "90d" },
];

export default function LeaderboardsPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<{
    topSellers: SellerOrBuyer[];
    topBuyers: SellerOrBuyer[];
    busiestSkus: BusySku[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/leaderboards?days=${days}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-end justify-between mb-1 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-black text-white">Leaderboards</h1>
            <p className="text-sm text-neutral-400 mt-1">
              The most active sellers, buyers, and markets on Cambridge TCG.
            </p>
          </div>
          <div className="flex gap-1 bg-neutral-900 rounded-lg p-1">
            {WINDOWS.map((w) => (
              <button
                key={w.value}
                onClick={() => setDays(w.value)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  days === w.value ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
                }`}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500 mt-8">Loading...</p>
        ) : !data ? (
          <p className="text-sm text-red-400 mt-8">Failed to load.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
            <Board title="Top sellers" empty={data.topSellers.length === 0}>
              {data.topSellers.map((s, i) => (
                <UserRow key={s.username} rank={i + 1} username={s.username} name={s.name}>
                  <div className="text-right">
                    <div className="text-xs font-mono text-amber-400">{formatPrice(s.volumeGbp)}</div>
                    <div className="text-[10px] text-neutral-500">{s.tradeCount} trade{s.tradeCount !== 1 ? "s" : ""}</div>
                  </div>
                </UserRow>
              ))}
            </Board>

            <Board title="Top buyers" empty={data.topBuyers.length === 0}>
              {data.topBuyers.map((b, i) => (
                <UserRow key={b.username} rank={i + 1} username={b.username} name={b.name}>
                  <div className="text-right">
                    <div className="text-xs font-mono text-emerald-400">{formatPrice(b.volumeGbp)}</div>
                    <div className="text-[10px] text-neutral-500">{b.tradeCount} trade{b.tradeCount !== 1 ? "s" : ""}</div>
                  </div>
                </UserRow>
              ))}
            </Board>

            <Board title="Busiest cards" empty={data.busiestSkus.length === 0}>
              {data.busiestSkus.map((s, i) => (
                <Link
                  key={s.sku}
                  href={`/market/${s.sku}`}
                  className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-neutral-800/60 transition group"
                >
                  <span className="text-[10px] text-neutral-600 font-mono w-4 text-right">{i + 1}</span>
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt="" className="w-6 h-8 rounded object-cover shrink-0" />
                  ) : (
                    <div className="w-6 h-8 bg-neutral-800 rounded shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-white truncate group-hover:text-amber-400 transition">
                      {s.cardName || s.sku}
                    </p>
                    <p className="text-[10px] text-neutral-600 font-mono truncate">{s.sku}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-mono text-white">{formatPrice(s.avgPrice)}</div>
                    <div className="text-[10px] text-neutral-500">{s.tradeCount}× &middot; {s.volume} units</div>
                  </div>
                </Link>
              ))}
            </Board>
          </div>
        )}
      </div>
    </div>
  );
}

function Board({ title, empty, children }: { title: string; empty: boolean; children: React.ReactNode }) {
  return (
    <section className="bg-neutral-900 rounded-xl p-4">
      <h2 className="text-xs font-bold text-neutral-300 uppercase tracking-wide mb-3">{title}</h2>
      {empty ? (
        <p className="text-xs text-neutral-500 py-6 text-center">No activity in this window.</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </section>
  );
}

function UserRow({ rank, username, name, children }: {
  rank: number; username: string; name: string | null; children: React.ReactNode;
}) {
  return (
    <Link
      href={`/u/${username}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-neutral-800/60 transition group"
    >
      <span className="text-[10px] text-neutral-600 font-mono w-4 text-right">{rank}</span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white truncate group-hover:text-amber-400 transition">
          {name || username}
        </p>
        <p className="text-[10px] text-neutral-600 font-mono truncate">@{username}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </Link>
  );
}
