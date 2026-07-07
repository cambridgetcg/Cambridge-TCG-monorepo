"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { EmptyState, Icon, Money, type IconName } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import { InkRule } from "@/lib/ui/InkRule";

interface PulseData {
  hot: Array<{ sku: string; cardName: string | null; imageUrl: string | null; volume24h: number; tradeCount24h: number }>;
  movers: Array<{ sku: string; cardName: string | null; imageUrl: string | null; lastPrice: number | null; change24hPct: number | null }>;
  mostWatched: Array<{ sku: string; cardName: string | null; imageUrl: string | null; watchCount: number; bestAsk: number | null }>;
  tightSpreads: Array<{ sku: string; cardName: string | null; imageUrl: string | null; bestBid: number | null; bestAsk: number | null }>;
  recentTrades: Array<{ sku: string; cardName: string | null; imageUrl: string | null; price: number | null; tradedAt: string | null }>;
}

// Wardrobe migration (spec §3.4): semantic tokens + Gallery materials only — same fetch, same 60s poll.
export default function MarketPulsePage() {
  const v = useVoice();
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
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-baseline justify-between mb-1">
        <h1 className="font-display tracking-tight text-2xl font-bold text-ink">{v("market.pulse.title")}</h1>
        <Link href="/market" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          Browse all markets <Icon name="arrow-right" size={12} />
        </Link>
      </div>
      <p className="text-sm text-ink-muted mb-8">
        {v("market.pulse.subtitle")}
      </p>

      {loading ? (
        <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <span className="sr-only">Loading market data…</span>
          <p className="md:col-span-2 font-display italic text-sm text-ink-faint">
            {v("market.pulse.loading")}
          </p>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="wardrobe-mat rounded-lg p-4 animate-pulse">
              <div className="h-3 bg-surface-subtle rounded w-1/3 mb-4" />
              <div className="h-8 bg-surface-subtle rounded mb-2" />
              <div className="h-8 bg-surface-subtle rounded mb-2" />
              <div className="h-8 bg-surface-subtle rounded" />
            </div>
          ))}
        </div>
      ) : !data ? (
        <p className="text-sm text-danger">{v("market.pulse.failed")}</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Hot */}
          <PulseCard
            title="Hot — most traded (24h)"
            icon="pulse"
            empty={data.hot.length === 0}
            emptyTitle={v("market.empty.trades.title")}
            emptyDesc={v("market.empty.trades.description")}
          >
            {data.hot.map((row, i) => (
              <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                <div className="text-right">
                  <div className="text-xs font-mono tabular-nums text-accent">{row.volume24h} units</div>
                  <div className="text-[10px] font-mono tabular-nums text-ink-faint">{row.tradeCount24h} trade{row.tradeCount24h !== 1 ? "s" : ""}</div>
                </div>
              </PulseRow>
            ))}
          </PulseCard>

          {/* Movers */}
          <PulseCard
            title="Big movers (24h)"
            icon="spark"
            empty={data.movers.length === 0}
            emptyTitle={v("market.empty.movers.title")}
            emptyDesc={v("market.empty.movers.description")}
          >
            {data.movers.map((row, i) => (
              <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                <div className="text-right">
                  <div className="text-xs font-mono tabular-nums text-ink">
                    {row.lastPrice !== null ? <Money value={row.lastPrice} /> : "—"}
                  </div>
                  {row.change24hPct !== null && (
                    <div className={`text-[10px] font-mono tabular-nums ${row.change24hPct > 0 ? "text-bid" : "text-ask"}`}>
                      {row.change24hPct > 0 ? "+" : ""}{row.change24hPct.toFixed(1)}%
                    </div>
                  )}
                </div>
              </PulseRow>
            ))}
          </PulseCard>

          {/* Most watched */}
          <PulseCard
            title="Most watched"
            icon="eye"
            empty={data.mostWatched.length === 0}
            emptyTitle={v("market.empty.watched.title")}
            emptyDesc={v("market.empty.watched.description")}
          >
            {data.mostWatched.map((row, i) => (
              <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                <div className="text-right">
                  <div className="flex items-center justify-end gap-1 text-xs font-mono tabular-nums text-accent">
                    {row.watchCount} <Icon name="eye" size={11} />
                  </div>
                  {row.bestAsk !== null && (
                    <div className="text-[10px] text-ink-faint font-mono tabular-nums">ask <Money value={row.bestAsk} /></div>
                  )}
                </div>
              </PulseRow>
            ))}
          </PulseCard>

          {/* Tight spreads */}
          <PulseCard
            title="Tightest spreads"
            icon="spread"
            empty={data.tightSpreads.length === 0}
            emptyTitle="No two-sided markets yet."
          >
            {data.tightSpreads.map((row, i) => {
              const spread = row.bestAsk !== null && row.bestBid !== null ? row.bestAsk - row.bestBid : null;
              return (
                <PulseRow key={row.sku} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl} rank={i + 1}>
                  <div className="text-right">
                    <div className="text-xs font-mono tabular-nums text-ink-muted">
                      {row.bestBid !== null && row.bestAsk !== null
                        ? `${formatPrice(row.bestBid)} / ${formatPrice(row.bestAsk)}`
                        : "—"}
                    </div>
                    {spread !== null && (
                      <div className="text-[10px] font-mono tabular-nums text-bid">spread <Money value={spread} /></div>
                    )}
                  </div>
                </PulseRow>
              );
            })}
          </PulseCard>

          {/* Recent trades — full width */}
          <div className="md:col-span-2">
            <PulseCard
              title="Latest trades"
              icon="tape"
              empty={data.recentTrades.length === 0}
              emptyTitle={v("market.empty.trades.title")}
              emptyDesc={v("market.empty.trades.description")}
            >
              {data.recentTrades.map((row) => (
                <PulseRow key={`${row.sku}-${row.tradedAt}`} sku={row.sku} cardName={row.cardName} imageUrl={row.imageUrl}>
                  <div className="text-right">
                    <div className="text-xs font-mono tabular-nums text-ink">
                      {row.price !== null ? <Money value={row.price} /> : "—"}
                    </div>
                    <div className="text-[10px] font-mono tabular-nums text-ink-faint">
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
  );
}

function PulseCard({ title, icon, empty, emptyTitle, emptyDesc, children }: {
  title: string; icon: IconName; empty: boolean; emptyTitle: string; emptyDesc?: string; children: React.ReactNode;
}) {
  return (
    <section className="wardrobe-mat rounded-lg p-4">
      <h2 className="flex items-center justify-between gap-1.5 mb-3">
        <span className="flex items-center gap-1.5 font-display text-xs font-semibold text-ink-faint uppercase tracking-wide">
          <Icon name={icon} size={14} className="text-accent" /> {title}
        </span>
      </h2>
      <InkRule className="mb-3 -mt-1" />
      {empty ? (
        <EmptyState title={emptyTitle} description={emptyDesc} />
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
      className="flex items-center gap-3 px-2 py-1.5 rounded hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-accent transition group"
    >
      {rank !== undefined && (
        <span className="text-[10px] text-ink-faint font-mono tabular-nums w-4 text-right">{rank}</span>
      )}
      {imageUrl ? (
        <img src={imageUrl} alt="" className="w-6 h-8 rounded border border-border-subtle object-cover shrink-0" />
      ) : (
        <div className="w-6 h-8 wardrobe-mat rounded shrink-0 flex items-center justify-center text-ink-faint">
          <Icon name="card" size={12} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink truncate group-hover:text-accent transition">
          {cardName || sku}
        </p>
        <p className="text-[10px] text-ink-faint font-mono truncate">{sku}</p>
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
