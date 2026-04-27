"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface PulseData {
  hot: Array<{ sku: string; cardName: string | null; imageUrl: string | null; volume24h: number; tradeCount24h: number }>;
  movers: Array<{ sku: string; cardName: string | null; imageUrl: string | null; lastPrice: number | null; change24hPct: number | null }>;
  mostWatched: Array<{ sku: string; cardName: string | null; imageUrl: string | null; watchCount: number; bestAsk: number | null }>;
  tightSpreads: Array<{ sku: string; cardName: string | null; imageUrl: string | null; bestBid: number | null; bestAsk: number | null }>;
  recentTrades: Array<{ sku: string; cardName: string | null; imageUrl: string | null; price: number | null; tradedAt: string | null }>;
}

export default function MarketPulsePage() {
  const [data, setData] = useState<PulseData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/market/pulse")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // Refresh every 60s — pulse data is "live" enough that staleness shows
    const t = setInterval(() => {
      fetch("/api/market/pulse").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d) setData(d); });
    }, 60000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between mb-1">
          <h1 className="text-2xl font-black text-white">Market Pulse</h1>
          <Link href="/market" className="text-xs text-amber-400 hover:underline">
            Browse all markets &rarr;
          </Link>
        </div>
        <p className="text-sm text-neutral-400 mb-8">
          What&rsquo;s moving in the last 24 hours, refreshed every minute.
        </p>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading...</p>
        ) : !data ? (
          <p className="text-sm text-red-400">Failed to load.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Hot */}
            <PulseCard title="Hot — most traded (24h)" empty={data.hot.length === 0} emptyText="No trades in the last 24h.">
              {data.hot.map((row, i) => (
                <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                  <div className="text-right">
                    <div className="text-xs font-mono text-amber-400">{row.volume24h} units</div>
                    <div className="text-[10px] text-neutral-500">{row.tradeCount24h} trade{row.tradeCount24h !== 1 ? "s" : ""}</div>
                  </div>
                </PulseRow>
              ))}
            </PulseCard>

            {/* Movers */}
            <PulseCard title="Big movers (24h)" empty={data.movers.length === 0} emptyText="No price moves to report.">
              {data.movers.map((row, i) => (
                <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                  <div className="text-right">
                    <div className="text-xs font-mono text-white">
                      {row.lastPrice !== null ? formatPrice(row.lastPrice) : "—"}
                    </div>
                    {row.change24hPct !== null && (
                      <div className={`text-[10px] font-mono ${row.change24hPct > 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {row.change24hPct > 0 ? "+" : ""}{row.change24hPct.toFixed(1)}%
                      </div>
                    )}
                  </div>
                </PulseRow>
              ))}
            </PulseCard>

            {/* Most watched */}
            <PulseCard title="Most watched" empty={data.mostWatched.length === 0} emptyText="No watchlist signal yet.">
              {data.mostWatched.map((row, i) => (
                <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                  <div className="text-right">
                    <div className="text-xs font-mono text-amber-400">{row.watchCount} ★</div>
                    {row.bestAsk !== null && (
                      <div className="text-[10px] text-neutral-500 font-mono">ask {formatPrice(row.bestAsk)}</div>
                    )}
                  </div>
                </PulseRow>
              ))}
            </PulseCard>

            {/* Tight spreads */}
            <PulseCard title="Tightest spreads" empty={data.tightSpreads.length === 0} emptyText="No two-sided markets yet.">
              {data.tightSpreads.map((row, i) => {
                const spread = row.bestAsk !== null && row.bestBid !== null ? row.bestAsk - row.bestBid : null;
                return (
                  <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                    <div className="text-right">
                      <div className="text-xs font-mono text-neutral-300">
                        {row.bestBid !== null && row.bestAsk !== null
                          ? `${formatPrice(row.bestBid)} / ${formatPrice(row.bestAsk)}`
                          : "—"}
                      </div>
                      {spread !== null && (
                        <div className="text-[10px] font-mono text-emerald-400">spread {formatPrice(spread)}</div>
                      )}
                    </div>
                  </PulseRow>
                );
              })}
            </PulseCard>

            {/* Recent trades — full width */}
            <div className="md:col-span-2">
              <PulseCard title="Latest trades" empty={data.recentTrades.length === 0} emptyText="No trades yet.">
                {data.recentTrades.map((row) => (
                  <PulseRow key={`${row.sku}-${row.tradedAt}`} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl}>
                    <div className="text-right">
                      <div className="text-xs font-mono text-white">
                        {row.price !== null ? formatPrice(row.price) : "—"}
                      </div>
                      <div className="text-[10px] text-neutral-500">
                        {row.tradedAt ? timeAgo(row.tradedAt) : ""}
                      </div>
                    </div>
                  </PulseRow>
                ))}
              </PulseCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PulseCard({ title, empty, emptyText, children }: {
  title: string; empty: boolean; emptyText: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-neutral-900 rounded-xl p-4">
      <h2 className="text-xs font-bold text-neutral-300 uppercase tracking-wide mb-3">{title}</h2>
      {empty ? (
        <p className="text-xs text-neutral-500 py-4 text-center">{emptyText}</p>
      ) : (
        <div className="space-y-1">{children}</div>
      )}
    </section>
  );
}

function PulseRow({ sku, cardName, imageUrl, rank, children }: {
  sku: string; cardName: string | null; imageUrl: string | null;
  rank?: number; children: React.ReactNode;
}) {
  return (
    <Link
      href={`/market/${sku}`}
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-neutral-800/60 transition group"
    >
      {rank !== undefined && (
        <span className="text-[10px] text-neutral-600 font-mono w-4 text-right">{rank}</span>
      )}
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-6 h-8 rounded object-cover shrink-0" />
      ) : (
        <div className="w-6 h-8 bg-neutral-800 rounded shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-white truncate group-hover:text-amber-400 transition">
          {cardName || sku}
        </p>
        <p className="text-[10px] text-neutral-600 font-mono truncate">{sku}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </Link>
  );
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
