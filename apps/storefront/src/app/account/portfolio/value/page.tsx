"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface CardLine {
  sku: string;
  card_name: string | null;
  set_code: string | null;
  set_name: string | null;
  rarity: string | null;
  condition: string;
  quantity: number;
  unit_price: number | null;
  total_value: number;
  cost_basis: number | null;
  unrealized_gain: number | null;
  priced: boolean;
  source: "best_ask" | "price_history" | null;
}

interface CollectionValue {
  total_value: number;
  total_cost: number;
  unrealized_gain: number;
  card_count: number;
  unique_sku_count: number;
  priced_sku_count: number;
  unpriced_sku_count: number;
  by_set: Array<{ set_code: string; set_name: string | null; total_value: number; cards: number }>;
  by_rarity: Array<{ rarity: string; total_value: number; cards: number }>;
  top_cards: CardLine[];
  evaluated_at: string;
}

interface ValuePoint {
  snapshot_date: string;
  total_value: number;
  total_cost: number | null;
  card_count: number;
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency", currency: "GBP",
  }).format(n);
}

export default function PortfolioValuePage() {
  const [value, setValue] = useState<CollectionValue | null>(null);
  const [series, setSeries] = useState<ValuePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/account/portfolio/value").then((r) => r.json()),
      fetch("/api/account/portfolio/value/series?days=180").then((r) => r.json()),
    ])
      .then(([v, s]) => {
        if (v.error) setError(v.error);
        else {
          setValue(v);
          setSeries(s.series ?? []);
        }
      })
      .catch(() => setError("Failed to load valuation"))
      .finally(() => setLoading(false));
  }, []);

  async function exportCertificate() {
    setExporting(true);
    try {
      // Trigger a download. The server returns Content-Disposition;
      // navigating to the URL is the simplest way to honor that.
      window.location.href = "/api/account/portfolio/value/export";
    } finally {
      setTimeout(() => setExporting(false), 1500);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
      <Audience kind="consumer" />
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !value) {
    return (
      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
        {error || "Couldn't compute valuation"}
      </div>
    );
  }

  const isEmpty = value.unique_sku_count === 0;
  const gainPositive = value.unrealized_gain > 0;
  const gainNegative = value.unrealized_gain < 0;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 flex-wrap mb-2">
        <h1 className="text-2xl font-black text-white">Collection Value</h1>
        <button
          onClick={exportCertificate}
          disabled={exporting || isEmpty}
          className="text-xs px-3 py-1.5 bg-neutral-800 text-neutral-200 hover:bg-neutral-700 rounded-lg font-medium disabled:opacity-50 transition"
        >
          {exporting ? "Preparing..." : "Export certificate ↓"}
        </button>
      </div>
      <p className="text-sm text-neutral-400 mb-6">
        Live market value of every card you own. Prices come from P2P best-asks
        first, then daily wholesale-cached spot prices. Cards with no available
        price are listed but contribute £0 to the total.
      </p>

      {isEmpty ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">
            No cards in your portfolio yet. Add some via the import or by buying from the catalog.
          </p>
          <Link
            href="/account/portfolio"
            className="inline-block mt-3 text-amber-400 text-xs font-semibold hover:text-amber-300"
          >
            Manage portfolio →
          </Link>
        </div>
      ) : (
        <>
          {/* Top stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            <div className="bg-neutral-900 rounded-xl p-4 border border-amber-500/20">
              <div className="text-[10px] uppercase tracking-wide text-amber-400/80">Total value</div>
              <div className="text-2xl font-black text-white mt-1">{fmt(value.total_value)}</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {value.priced_sku_count} of {value.unique_sku_count} priced
              </div>
            </div>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Total cost</div>
              <div className="text-2xl font-black text-neutral-300 mt-1">{fmt(value.total_cost)}</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {value.total_cost === 0 ? "no acquisition prices set" : "from acquisition_price"}
              </div>
            </div>
            <div className={`bg-neutral-900 rounded-xl p-4 border ${
              gainPositive ? "border-emerald-500/30"
                : gainNegative ? "border-red-500/30"
                : "border-neutral-800"
            }`}>
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Unrealized P&L</div>
              <div className={`text-2xl font-black mt-1 ${
                gainPositive ? "text-emerald-400"
                  : gainNegative ? "text-red-400"
                  : "text-white"
              }`}>
                {gainPositive ? "+" : ""}{fmt(value.unrealized_gain)}
              </div>
              <div className="text-[10px] text-neutral-500 mt-1">
                priced cards with cost basis
              </div>
            </div>
            <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
              <div className="text-[10px] uppercase tracking-wide text-neutral-500">Cards</div>
              <div className="text-2xl font-black text-white mt-1">{value.card_count}</div>
              <div className="text-[10px] text-neutral-500 mt-1">
                {value.unique_sku_count} unique SKUs
              </div>
            </div>
          </div>

          {/* Time-series chart */}
          {series.length > 1 && (
            <div className="bg-neutral-900 rounded-xl p-5 mb-6 border border-neutral-800">
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="text-xs uppercase tracking-wide text-neutral-500">Value over time</h2>
                <span className="text-[10px] text-neutral-500">{series.length} days</span>
              </div>
              <SparkLine series={series} />
            </div>
          )}

          {/* By-set breakdown */}
          {value.by_set.length > 0 && (
            <div className="bg-neutral-900 rounded-xl p-5 mb-6 border border-neutral-800">
              <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">By set</h2>
              <div className="space-y-2">
                {value.by_set.slice(0, 10).map((s) => {
                  const pct = value.total_value > 0
                    ? (s.total_value / value.total_value) * 100 : 0;
                  return (
                    <div key={s.set_code} className="flex items-center gap-3 text-xs">
                      <Link
                        href={`/account/sets/${encodeURIComponent(s.set_code)}`}
                        className="w-32 truncate text-neutral-300 hover:text-amber-400 transition"
                      >
                        {s.set_name || s.set_code}
                      </Link>
                      <div className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                        <div className="h-full bg-amber-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 text-right font-mono text-white">{fmt(s.total_value)}</span>
                      <span className="w-10 text-right text-neutral-500 text-[10px]">
                        {s.cards}
                      </span>
                    </div>
                  );
                })}
              </div>
              {value.by_set.length > 10 && (
                <p className="text-[10px] text-neutral-600 mt-2">
                  + {value.by_set.length - 10} more sets
                </p>
              )}
            </div>
          )}

          {/* Top 10 cards by value */}
          {value.top_cards.length > 0 && (
            <div className="bg-neutral-900 rounded-xl p-5 mb-6 border border-neutral-800">
              <h2 className="text-xs uppercase tracking-wide text-neutral-500 mb-3">
                Top 10 most valuable
              </h2>
              <div className="space-y-1">
                {value.top_cards.map((c) => (
                  <Link
                    key={`${c.sku}-${c.condition}`}
                    href={`/market/${encodeURIComponent(c.sku)}`}
                    className="flex items-center gap-3 text-xs py-1.5 hover:bg-neutral-800/50 rounded px-2 transition"
                  >
                    <span className="flex-1 min-w-0">
                      <span className="text-white font-medium truncate block">{c.card_name || c.sku}</span>
                      <span className="text-[10px] text-neutral-500">
                        {c.set_code} · {c.rarity || "—"} · {c.condition} · ×{c.quantity}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-white font-mono">{fmt(c.total_value)}</span>
                      <span className="text-[10px] text-neutral-500">
                        {c.unit_price ? `${fmt(c.unit_price)} ea` : "no price"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {value.unpriced_sku_count > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-300">
              <strong>{value.unpriced_sku_count}</strong> card{value.unpriced_sku_count === 1 ? "" : "s"}{" "}
              couldn't be priced — no live ask on the order book and no recent
              wholesale spot. They show £0 in the total above.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Lightweight inline sparkline. We don't pull in a chart library
// because this is a single small chart on a single page.
function SparkLine({ series }: { series: ValuePoint[] }) {
  if (series.length < 2) return null;
  const width = 600;
  const height = 80;
  const values = series.map((p) => p.total_value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = series
    .map((p, i) => {
      const x = (i / (series.length - 1)) * width;
      const y = height - ((p.total_value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(" ");
  const lastVal = series[series.length - 1].total_value;
  const firstVal = series[0].total_value;
  const delta = lastVal - firstVal;
  const deltaPct = firstVal > 0 ? (delta / firstVal) * 100 : 0;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-20">
        <polyline
          fill="none"
          stroke={delta >= 0 ? "#10b981" : "#ef4444"}
          strokeWidth="2"
          points={points}
        />
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-500 mt-1">
        <span>{series[0].snapshot_date}</span>
        <span className={delta >= 0 ? "text-emerald-400" : "text-red-400"}>
          {delta >= 0 ? "+" : ""}{fmt(delta)} ({delta >= 0 ? "+" : ""}{deltaPct.toFixed(1)}%)
        </span>
        <span>{series[series.length - 1].snapshot_date}</span>
      </div>
    </div>
  );
}
