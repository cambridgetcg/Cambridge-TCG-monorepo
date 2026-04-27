"use client";

import { useMemo } from "react";

// Loose type so the component doesn't drag the full page types over.
export interface StatsCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  rarity: string | null;
  image_url: string | null;
  spot_price: number;
}
export interface StatsEntry {
  card: StatsCard;
  quantity: number;
}

interface DeckStatsPanelProps {
  leader: StatsCard | null;
  entries: StatsEntry[];
  totalCards: number;
  maxDeckSize: number;
}

const TRACKED_RARITIES = ["C", "UC", "R", "SR", "SEC", "SP", "L"] as const;
type TrackedRarity = (typeof TRACKED_RARITIES)[number];

const RARITY_COLOR: Record<string, string> = {
  C: "bg-neutral-500",
  UC: "bg-blue-500",
  R: "bg-purple-500",
  SR: "bg-amber-500",
  SEC: "bg-rose-500",
  SP: "bg-rose-500",
  L: "bg-emerald-500",
};

// Normalize a rarity string into one of our tracked buckets or "other".
function bucket(rarity: string | null): TrackedRarity | "other" {
  if (!rarity) return "other";
  const r = rarity.toUpperCase();
  if ((TRACKED_RARITIES as readonly string[]).includes(r)) return r as TrackedRarity;
  return "other";
}

function formatGbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

export default function DeckStatsPanel({
  leader,
  entries,
  totalCards,
  maxDeckSize,
}: DeckStatsPanelProps) {
  const stats = useMemo(() => {
    // Rarity counts (by copies, not uniques)
    const rarityCounts: Record<TrackedRarity | "other", number> = {
      C: 0, UC: 0, R: 0, SR: 0, SEC: 0, SP: 0, L: 0, other: 0,
    };
    let totalValue = 0;
    const prices: number[] = [];
    for (const e of entries) {
      rarityCounts[bucket(e.card.rarity)] += e.quantity;
      totalValue += e.card.spot_price * e.quantity;
      for (let i = 0; i < e.quantity; i++) prices.push(e.card.spot_price);
    }
    const avg = totalCards > 0 ? totalValue / totalCards : 0;
    const sortedPrices = prices.slice().sort((a, b) => a - b);
    const median = sortedPrices.length === 0
      ? 0
      : sortedPrices.length % 2 === 0
        ? (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2
        : sortedPrices[(sortedPrices.length - 1) / 2];
    const min = sortedPrices[0] ?? 0;
    const max = sortedPrices[sortedPrices.length - 1] ?? 0;

    // Top 5 by spot
    const topByValue = entries
      .slice()
      .sort((a, b) => b.card.spot_price - a.card.spot_price)
      .slice(0, 5);

    // Set mix
    const setCounts = new Map<string, number>();
    for (const e of entries) {
      const s = e.card.set_code || "—";
      setCounts.set(s, (setCounts.get(s) ?? 0) + e.quantity);
    }
    const setMix = Array.from(setCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return {
      rarityCounts,
      totalValue,
      avg,
      median,
      min,
      max,
      topByValue,
      setMix,
      uniqueCount: entries.length,
    };
  }, [entries, totalCards]);

  const fullDeckValue = stats.totalValue + (leader?.spot_price ?? 0);

  if (entries.length === 0) {
    return (
      <div className="text-xs text-neutral-500 py-4 text-center">
        Add cards to see deck statistics.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Rarity stacked bar */}
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
            Rarity mix
          </p>
          <p className="text-[10px] text-neutral-500">
            {stats.uniqueCount} unique · {totalCards}/{maxDeckSize} copies
          </p>
        </div>
        <div className="flex h-4 rounded-full overflow-hidden bg-neutral-900">
          {TRACKED_RARITIES.map((r) => {
            const n = stats.rarityCounts[r];
            if (n === 0) return null;
            const pct = (n / Math.max(1, totalCards)) * 100;
            return (
              <div
                key={r}
                className={`${RARITY_COLOR[r]} h-full`}
                style={{ width: `${pct}%` }}
                title={`${r}: ${n} (${pct.toFixed(1)}%)`}
              />
            );
          })}
          {stats.rarityCounts.other > 0 && (
            <div
              className="bg-neutral-600 h-full"
              style={{ width: `${(stats.rarityCounts.other / Math.max(1, totalCards)) * 100}%` }}
              title={`Other: ${stats.rarityCounts.other}`}
            />
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px]">
          {TRACKED_RARITIES.map((r) => {
            const n = stats.rarityCounts[r];
            if (n === 0) return null;
            return (
              <span key={r} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-sm ${RARITY_COLOR[r]}`} />
                <span className="text-neutral-300">{r}</span>
                <span className="text-neutral-500">{n}</span>
              </span>
            );
          })}
          {stats.rarityCounts.other > 0 && (
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-sm bg-neutral-600" />
              <span className="text-neutral-300">other</span>
              <span className="text-neutral-500">{stats.rarityCounts.other}</span>
            </span>
          )}
        </div>
      </div>

      {/* Price stats */}
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
          Spot price
        </p>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="bg-neutral-900 rounded-lg p-2">
            <p className="text-[10px] text-neutral-500">Total</p>
            <p className="text-sm font-bold text-amber-400">{formatGbp(fullDeckValue)}</p>
          </div>
          <div className="bg-neutral-900 rounded-lg p-2">
            <p className="text-[10px] text-neutral-500">Avg/card</p>
            <p className="text-sm font-bold text-neutral-200">{formatGbp(stats.avg)}</p>
          </div>
          <div className="bg-neutral-900 rounded-lg p-2">
            <p className="text-[10px] text-neutral-500">Median</p>
            <p className="text-sm font-bold text-neutral-200">{formatGbp(stats.median)}</p>
          </div>
          <div className="bg-neutral-900 rounded-lg p-2">
            <p className="text-[10px] text-neutral-500">Range</p>
            <p className="text-[11px] font-bold text-neutral-200 leading-tight">
              {formatGbp(stats.min)}
              <span className="text-neutral-500 mx-1">–</span>
              {formatGbp(stats.max)}
            </p>
          </div>
        </div>
      </div>

      {/* Top cards by value */}
      {stats.topByValue.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
            Top cards by spot
          </p>
          <div className="space-y-1">
            {stats.topByValue.map((e) => (
              <div
                key={e.card.sku}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0 flex items-center gap-2">
                  <span className="text-neutral-500 text-[10px] font-mono w-5 text-right flex-shrink-0">
                    ×{e.quantity}
                  </span>
                  <span className="text-neutral-300 truncate">{e.card.name}</span>
                  {e.card.rarity && (
                    <span className="text-[9px] text-neutral-500 flex-shrink-0">
                      {e.card.rarity}
                    </span>
                  )}
                </div>
                <span className="text-amber-400 font-semibold flex-shrink-0">
                  {formatGbp(e.card.spot_price)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Set mix */}
      {stats.setMix.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
            Set mix
          </p>
          <div className="flex flex-wrap gap-1.5">
            {stats.setMix.map(([code, n]) => (
              <span
                key={code}
                className="text-[10px] bg-neutral-900 border border-neutral-800 rounded px-2 py-1"
              >
                <span className="text-neutral-400 font-mono">{code}</span>
                <span className="text-neutral-500 ml-1.5">{n}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
