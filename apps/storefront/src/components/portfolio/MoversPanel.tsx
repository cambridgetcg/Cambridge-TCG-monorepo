"use client";

import { useMemo } from "react";
import Image from "next/image";
import type { ValuatedCard } from "@/lib/portfolio/types";

interface TrendMap {
  [sku: string]: { d7: number | null; d30: number | null };
}

interface Props {
  cards: ValuatedCard[];
  trends: TrendMap;
  window?: 7 | 30;
}

// Renders two side-by-side stacks: Top gainers + Top losers over the chosen
// window. Position size in the portfolio (quantity × spot) is shown so the
// reader can tell which swings actually move their bag.

function pickKey(window: 7 | 30): "d7" | "d30" {
  return window === 7 ? "d7" : "d30";
}

export default function MoversPanel({ cards, trends, window = 7 }: Props) {
  const key = pickKey(window);

  const scored = useMemo(() => {
    return cards
      .map((c) => ({ card: c, pct: trends[c.sku]?.[key] ?? null }))
      .filter((x): x is { card: ValuatedCard; pct: number } => x.pct != null);
  }, [cards, trends, key]);

  const gainers = useMemo(
    () => scored.slice().sort((a, b) => b.pct - a.pct).slice(0, 5),
    [scored],
  );
  const losers = useMemo(
    () => scored.slice().sort((a, b) => a.pct - b.pct).slice(0, 5),
    [scored],
  );

  // Nothing to show yet — typically means we haven't accumulated enough
  // history for this user's SKUs.
  if (scored.length === 0) {
    return (
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
        <p className="text-sm font-bold mb-1">Movers — last {window} days</p>
        <p className="text-xs text-neutral-500">
          No price history yet. Check back after the next daily price tick.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-bold">Movers</h3>
        <p className="text-[11px] text-neutral-500">last {window} days · {scored.length} tracked</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <MoversList title="Gainers" items={gainers} tone="emerald" />
        <MoversList title="Losers" items={losers} tone="red" />
      </div>
    </div>
  );
}

function MoversList({
  title, items, tone,
}: {
  title: string;
  items: Array<{ card: ValuatedCard; pct: number }>;
  tone: "emerald" | "red";
}) {
  const tonePctCls = tone === "emerald" ? "text-emerald-400" : "text-red-400";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-2">{title}</p>
      <div className="space-y-1.5">
        {items.length === 0 && (
          <p className="text-[11px] text-neutral-600 italic">Nothing on this side yet.</p>
        )}
        {items.map(({ card, pct }) => {
          const positive = pct >= 0;
          const sign = positive ? "+" : "";
          return (
            <div
              key={card.sku + card.condition}
              className="flex items-center gap-2 text-xs"
            >
              <div className="relative w-8 h-11 flex-shrink-0 rounded overflow-hidden bg-neutral-800">
                {card.image_url && (
                  <Image src={card.image_url} alt={card.card_name ?? card.sku} fill sizes="32px" className="object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-neutral-300 truncate">{card.card_name ?? card.sku}</p>
                <p className="text-[10px] text-neutral-500 truncate">
                  {card.card_number ?? card.sku} · £{card.current_value.toFixed(2)} pos
                </p>
              </div>
              <span className={`font-mono font-bold flex-shrink-0 ${tonePctCls}`}>
                {sign}{pct.toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
