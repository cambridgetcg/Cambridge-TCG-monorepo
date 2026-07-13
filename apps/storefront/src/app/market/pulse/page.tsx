"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { EmptyState, Icon, Money, type IconName } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import { InkRule } from "@/lib/ui/InkRule";

interface PulseData {
  tightSpreads: Array<{ sku: string; cardName: string | null; imageUrl: string | null; bestBid: number | null; bestAsk: number | null }>;
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
    // Open orders are live intent, so refresh their spreads once a minute.
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
        Live spreads come from bids and asks collectors chose to publish.
        Completed-trade analytics and public watch, alert, and co-watch
        intelligence are paused.
      </p>

      {loading ? (
        <div aria-busy="true" aria-live="polite" className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <span className="sr-only">Loading market data…</span>
          <p className="md:col-span-2 font-display italic text-sm text-ink-faint">
            {v("market.pulse.loading")}
          </p>
          {Array.from({ length: 2 }).map((_, i) => (
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
          <PulseCard
            title="Tightest open-order spreads"
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
          <div className="border-l-2 border-border-strong pl-4 py-1 text-sm text-ink-muted">
            <p className="font-medium text-ink">Private signals stay private.</p>
            <p className="mt-1">
              Public trade, watch, alert, and co-watch summaries will return
              only after they have their own publication choice and a delayed,
              coarse release process that resists reconstruction.
            </p>
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
