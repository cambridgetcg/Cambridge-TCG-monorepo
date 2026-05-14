"use client";

import { useMemo } from "react";

// Loose type so the component doesn't drag the full page types over.
//
// Yu 2026-05-14: the play module is fun-first. Spot price is intentionally
// NOT a property of a deck-stat card here — the deck builder is a play
// surface and must not surface monetary value. The interface used to
// carry `spot_price`; it was removed when the price-stats block was
// stripped. See docs/principles/cosmology.md §game-economy vs
// real-economy: deck building lives in the game-economy.
export interface StatsCard {
  sku: string;
  card_number: string;
  name: string;
  set_code: string;
  rarity: string | null;
  image_url: string | null;
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

export default function DeckStatsPanel({
  leader: _leader,
  entries,
  totalCards,
  maxDeckSize,
}: DeckStatsPanelProps) {
  const stats = useMemo(() => {
    // Rarity counts (by copies, not uniques)
    const rarityCounts: Record<TrackedRarity | "other", number> = {
      C: 0, UC: 0, R: 0, SR: 0, SEC: 0, SP: 0, L: 0, other: 0,
    };
    for (const e of entries) {
      rarityCounts[bucket(e.card.rarity)] += e.quantity;
    }

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
      setMix,
      uniqueCount: entries.length,
    };
  }, [entries]);

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
