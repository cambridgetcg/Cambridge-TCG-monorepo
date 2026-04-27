"use client";

import { useMemo } from "react";
import type { ValuatedCard, PortfolioSummary } from "@/lib/portfolio/types";

// Pure client-side breakdown panel. Takes the ValuatedCard[] the page already
// has loaded and groups by set / rarity / condition / acquisition-year. No
// new data dependencies.

interface Props {
  cards: ValuatedCard[];
  summary: PortfolioSummary;
}

const RARITY_ORDER = ["L", "SEC", "SR", "SP", "R", "UC", "C"];
const RARITY_COLOR: Record<string, string> = {
  L: "bg-emerald-500",
  SEC: "bg-rose-500",
  SR: "bg-amber-500",
  SP: "bg-rose-500",
  R: "bg-purple-500",
  UC: "bg-blue-500",
  C: "bg-neutral-500",
};
const CONDITION_LABEL: Record<string, string> = {
  NM: "Near Mint", LP: "Lightly Played", MP: "Moderately Played",
  HP: "Heavily Played", DMG: "Damaged",
};

function gbp(n: number): string {
  return `£${n.toFixed(2)}`;
}

interface BucketRow {
  key: string;
  label: string;
  copies: number;
  value: number;
}

function group(
  cards: ValuatedCard[],
  fn: (c: ValuatedCard) => { key: string; label: string } | null,
): BucketRow[] {
  const acc = new Map<string, BucketRow>();
  for (const c of cards) {
    const b = fn(c);
    if (!b) continue;
    const row = acc.get(b.key) ?? { key: b.key, label: b.label, copies: 0, value: 0 };
    row.copies += c.quantity;
    row.value += c.current_value;
    acc.set(b.key, row);
  }
  return Array.from(acc.values()).sort((a, b) => b.value - a.value);
}

function StackedBar({
  rows, total, colorOf,
}: {
  rows: BucketRow[];
  total: number;
  colorOf: (key: string) => string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex h-4 rounded-full overflow-hidden bg-neutral-900 mb-2">
      {rows.map((r) => {
        const pct = (r.value / total) * 100;
        return (
          <div
            key={r.key}
            className={`${colorOf(r.key)} h-full`}
            style={{ width: `${pct}%` }}
            title={`${r.label}: ${gbp(r.value)} (${pct.toFixed(1)}%)`}
          />
        );
      })}
    </div>
  );
}

function Legend({
  rows, total, colorOf, showValueRow = true,
}: {
  rows: BucketRow[];
  total: number;
  colorOf: (key: string) => string;
  showValueRow?: boolean;
}) {
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const pct = total === 0 ? 0 : (r.value / total) * 100;
        return (
          <div
            key={r.key}
            className="flex items-center gap-2 text-[11px]"
          >
            <span className={`w-2 h-2 rounded-sm ${colorOf(r.key)} flex-shrink-0`} />
            <span className="text-neutral-300 flex-1 truncate">{r.label}</span>
            <span className="text-neutral-500 w-12 text-right">
              {r.copies}×
            </span>
            {showValueRow && (
              <>
                <span className="text-amber-400 font-semibold w-16 text-right">
                  {gbp(r.value)}
                </span>
                <span className="text-neutral-600 w-10 text-right">
                  {pct.toFixed(0)}%
                </span>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function PortfolioAnalytics({ cards, summary }: Props) {
  const bySet = useMemo(
    () => group(cards, (c) => {
      if (!c.set_code) return { key: "—", label: "Unknown" };
      return { key: c.set_code, label: c.set_name || c.set_code };
    }),
    [cards],
  );

  const byRarity = useMemo(() => {
    const raw = group(cards, (c) => {
      const r = (c.rarity ?? "").toUpperCase() || "OTHER";
      return { key: r, label: r };
    });
    // Put rarities in the canonical order when present.
    const rank = new Map(RARITY_ORDER.map((r, i) => [r, i]));
    return raw.sort((a, b) => (rank.get(a.key) ?? 99) - (rank.get(b.key) ?? 99));
  }, [cards]);

  const byCondition = useMemo(
    () => group(cards, (c) => ({
      key: c.condition,
      label: CONDITION_LABEL[c.condition] ?? c.condition,
    })),
    [cards],
  );

  const byAcquisitionYear = useMemo(
    () => group(cards, (c) => {
      if (!c.acquired_at) return { key: "—", label: "Undated" };
      const y = c.acquired_at.slice(0, 4);
      return { key: y, label: y };
    }).sort((a, b) => b.key.localeCompare(a.key)),
    [cards],
  );

  // Concentration: how much of portfolio value sits in the top 5 cards?
  const sorted = useMemo(
    () => cards.slice().sort((a, b) => b.current_value - a.current_value),
    [cards],
  );
  const top5Value = sorted.slice(0, 5).reduce((s, c) => s + c.current_value, 0);
  const top5Pct = summary.total_value > 0 ? (top5Value / summary.total_value) * 100 : 0;

  if (cards.length === 0) return null;

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
      <h3 className="text-sm font-bold mb-4">Collection Breakdown</h3>

      {/* Sets */}
      <section className="mb-5">
        <div className="flex items-baseline justify-between mb-1.5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">
            By Set
          </p>
          <p className="text-[10px] text-neutral-500">{bySet.length} sets</p>
        </div>
        <StackedBar
          rows={bySet.slice(0, 8)}
          total={summary.total_value}
          colorOf={() => "bg-amber-500"}
        />
        <Legend
          rows={bySet.slice(0, 8)}
          total={summary.total_value}
          colorOf={() => "bg-amber-500"}
        />
        {bySet.length > 8 && (
          <p className="text-[10px] text-neutral-600 mt-1">
            +{bySet.length - 8} more sets
          </p>
        )}
      </section>

      {/* Rarity */}
      <section className="mb-5">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
          By Rarity
        </p>
        <StackedBar
          rows={byRarity}
          total={summary.total_value}
          colorOf={(k) => RARITY_COLOR[k] ?? "bg-neutral-600"}
        />
        <Legend
          rows={byRarity}
          total={summary.total_value}
          colorOf={(k) => RARITY_COLOR[k] ?? "bg-neutral-600"}
        />
      </section>

      {/* Condition */}
      <section className="mb-5">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
          By Condition
        </p>
        <Legend
          rows={byCondition}
          total={summary.total_value}
          colorOf={() => "bg-neutral-500"}
        />
      </section>

      {/* Acquisition year */}
      {byAcquisitionYear.length > 0 && byAcquisitionYear[0].key !== "—" && (
        <section className="mb-5">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
            By Acquisition Year
          </p>
          <Legend
            rows={byAcquisitionYear}
            total={summary.total_value}
            colorOf={() => "bg-neutral-500"}
          />
        </section>
      )}

      {/* Concentration */}
      <section>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1.5">
          Concentration
        </p>
        <div className="bg-neutral-950/40 border border-neutral-800 rounded-lg p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-neutral-300">Top 5 cards</span>
            <div className="text-right">
              <span className="text-lg font-bold text-amber-400">{gbp(top5Value)}</span>
              <span className="text-xs text-neutral-500 ml-1.5">({top5Pct.toFixed(0)}%)</span>
            </div>
          </div>
          <div className="mt-2 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-amber-500 transition-all"
              style={{ width: `${Math.min(100, top5Pct)}%` }}
            />
          </div>
          <p className="text-[10px] text-neutral-600 mt-1.5 leading-relaxed">
            {top5Pct >= 80
              ? "Very concentrated — most of your value is in a handful of cards."
              : top5Pct >= 50
                ? "Moderately concentrated — your top cards dominate but you have diversity."
                : "Well spread — no single card dominates your portfolio."}
          </p>
        </div>
      </section>
    </div>
  );
}
