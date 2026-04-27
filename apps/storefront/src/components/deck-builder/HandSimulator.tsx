"use client";

import { useMemo, useState, useCallback } from "react";
import Image from "next/image";

// Matches the shape of a CatalogCard in deck-builder/page.tsx. Kept loose so
// this component doesn't drag the full page type definition over.
export interface SimCard {
  sku: string;
  card_number: string;
  name: string;
  rarity: string | null;
  image_url: string | null;
}

export interface SimDeckEntry {
  card: SimCard;
  quantity: number;
}

interface HandSimulatorProps {
  leader: SimCard | null;
  entries: SimDeckEntry[];
  onClose: () => void;
  /** Starting hand size. OPTCG draws 5. */
  handSize?: number;
}

// Fisher-Yates shuffle — in place, returns the same array for chaining.
function shuffle<T>(xs: T[]): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  return xs;
}

// Expand { card, quantity } entries into a flat array of N card instances.
function expand(entries: SimDeckEntry[]): SimCard[] {
  const out: SimCard[] = [];
  for (const e of entries) for (let i = 0; i < e.quantity; i++) out.push(e.card);
  return out;
}

export default function HandSimulator({
  leader,
  entries,
  onClose,
  handSize = 5,
}: HandSimulatorProps) {
  const deck = useMemo(() => expand(entries), [entries]);
  const [hand, setHand] = useState<SimCard[]>(() => shuffle([...deck]).slice(0, handSize));
  const [drawCount, setDrawCount] = useState(1);
  const [targetSkus, setTargetSkus] = useState<Set<string>>(new Set());
  const [simResult, setSimResult] = useState<{
    trials: number;
    pAtLeastOne: number;
    countDist: Record<number, number>;
    avgRarity: { C: number; UC: number; R: number; SR: number; SEC: number; other: number };
  } | null>(null);
  const [simRunning, setSimRunning] = useState(false);

  const redraw = useCallback(() => {
    setHand(shuffle([...deck]).slice(0, handSize));
    setDrawCount((n) => n + 1);
    setSimResult(null);
  }, [deck, handSize]);

  const mulligan = useCallback(() => {
    // OPTCG mulligan is a full redraw once, shuffling hand back in. Same effect.
    redraw();
  }, [redraw]);

  const toggleTarget = useCallback((sku: string) => {
    setTargetSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }, []);

  const runSimulation = useCallback(() => {
    if (deck.length < handSize) return;
    setSimRunning(true);
    // Do it async so the UI can show the "running" state first.
    setTimeout(() => {
      const TRIALS = 10_000;
      let hitCount = 0;
      const countDist: Record<number, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
      const rarityTotals = { C: 0, UC: 0, R: 0, SR: 0, SEC: 0, other: 0 };

      const scratch = deck.slice();
      for (let t = 0; t < TRIALS; t++) {
        // Partial Fisher-Yates — only need the first handSize positions shuffled.
        for (let i = 0; i < handSize; i++) {
          const j = i + Math.floor(Math.random() * (scratch.length - i));
          [scratch[i], scratch[j]] = [scratch[j], scratch[i]];
        }
        let keyCount = 0;
        for (let i = 0; i < handSize; i++) {
          const c = scratch[i];
          if (targetSkus.has(c.sku)) keyCount++;
          const r = (c.rarity ?? "").toUpperCase();
          if (r === "C") rarityTotals.C++;
          else if (r === "UC") rarityTotals.UC++;
          else if (r === "R") rarityTotals.R++;
          else if (r === "SR") rarityTotals.SR++;
          else if (r === "SEC" || r === "SP") rarityTotals.SEC++;
          else rarityTotals.other++;
        }
        if (keyCount > 0) hitCount++;
        const key = keyCount >= 4 ? 4 : keyCount;
        countDist[key] = (countDist[key] ?? 0) + 1;
      }

      setSimResult({
        trials: TRIALS,
        pAtLeastOne: hitCount / TRIALS,
        countDist,
        avgRarity: {
          C: rarityTotals.C / TRIALS,
          UC: rarityTotals.UC / TRIALS,
          R: rarityTotals.R / TRIALS,
          SR: rarityTotals.SR / TRIALS,
          SEC: rarityTotals.SEC / TRIALS,
          other: rarityTotals.other / TRIALS,
        },
      });
      setSimRunning(false);
    }, 0);
  }, [deck, handSize, targetSkus]);

  // Unique SKUs in deck for the target selector
  const uniqueEntries = useMemo(() => entries.slice().sort((a, b) => {
    // Selected first, then alphabetical
    const aSel = targetSkus.has(a.card.sku);
    const bSel = targetSkus.has(b.card.sku);
    if (aSel !== bSel) return aSel ? -1 : 1;
    return a.card.name.localeCompare(b.card.name);
  }), [entries, targetSkus]);

  const tooSmall = deck.length < handSize;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-3xl w-full shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between mb-5">
          <div>
            <h2 className="text-xl font-bold">Opening Hand Simulator</h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              {leader ? `Leader: ${leader.name} · ` : ""}
              {deck.length} cards in deck · draw {handSize}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>

        {tooSmall && (
          <div className="mb-4 bg-amber-900/30 border border-amber-700/40 text-amber-300 rounded-lg px-4 py-3 text-sm">
            Add at least {handSize} cards to simulate an opening hand.
          </div>
        )}

        {/* Current hand */}
        <div className="mb-6">
          <div className="flex items-baseline justify-between mb-2">
            <h3 className="text-sm font-bold">Current hand · draw #{drawCount}</h3>
            <div className="flex gap-2">
              <button
                onClick={mulligan}
                disabled={tooSmall}
                className="text-xs bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Mulligan
              </button>
              <button
                onClick={redraw}
                disabled={tooSmall}
                className="text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold rounded px-3 py-1.5 transition-colors disabled:opacity-40"
              >
                Shuffle &amp; Draw
              </button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {hand.map((card, i) => (
              <div key={`${card.sku}-${i}`} className="relative aspect-[5/7] rounded-md overflow-hidden bg-neutral-800 border border-neutral-700">
                {card.image_url ? (
                  <Image
                    src={card.image_url}
                    alt={card.name}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-neutral-500 text-center p-1">
                    {card.name}
                  </div>
                )}
                {targetSkus.has(card.sku) && (
                  <div className="absolute inset-0 ring-2 ring-amber-400 ring-inset rounded-md pointer-events-none" />
                )}
              </div>
            ))}
            {Array.from({ length: Math.max(0, handSize - hand.length) }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-[5/7] rounded-md bg-neutral-800/40 border border-dashed border-neutral-800" />
            ))}
          </div>
        </div>

        {/* Key-card picker */}
        {entries.length > 0 && (
          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <h3 className="text-sm font-bold">Target cards for probability</h3>
              <span className="text-[11px] text-neutral-500">
                {targetSkus.size === 0 ? "tap cards in your deck list to track" : `${targetSkus.size} selected`}
              </span>
            </div>
            <div className="max-h-40 overflow-y-auto bg-neutral-950/40 border border-neutral-800 rounded-lg p-2">
              <div className="flex flex-wrap gap-1.5">
                {uniqueEntries.map((e) => {
                  const sel = targetSkus.has(e.card.sku);
                  return (
                    <button
                      key={e.card.sku}
                      onClick={() => toggleTarget(e.card.sku)}
                      className={`text-[11px] rounded px-2 py-1 transition-colors ${
                        sel
                          ? "bg-amber-500 text-black font-semibold"
                          : "bg-neutral-800 hover:bg-neutral-700 text-neutral-300"
                      }`}
                    >
                      {sel && "✓ "}
                      {e.card.name}
                      <span className="text-[9px] opacity-60 ml-1">×{e.quantity}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Probability */}
        <div>
          <button
            onClick={runSimulation}
            disabled={tooSmall || targetSkus.size === 0 || simRunning}
            className="w-full bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-semibold rounded-lg py-3 transition-colors disabled:opacity-50 text-sm"
          >
            {simRunning
              ? "Running 10,000 sims..."
              : targetSkus.size === 0
                ? "Pick at least one target card"
                : `Run 10,000 simulations for ${targetSkus.size} key card${targetSkus.size === 1 ? "" : "s"}`}
          </button>

          {simResult && (
            <div className="mt-4 bg-neutral-950/40 border border-neutral-800 rounded-lg p-4 space-y-3">
              <div className="flex items-baseline justify-between">
                <p className="text-xs uppercase tracking-wider text-neutral-500 font-bold">
                  Probability of opening at least one
                </p>
                <p className="text-2xl font-extrabold text-amber-400">
                  {(simResult.pAtLeastOne * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">
                  Distribution (how many key cards in hand)
                </p>
                <div className="grid grid-cols-5 gap-1.5 text-[11px]">
                  {[0, 1, 2, 3, 4].map((k) => {
                    const pct = ((simResult.countDist[k] ?? 0) / simResult.trials) * 100;
                    return (
                      <div key={k} className="bg-neutral-900 rounded p-1.5 text-center">
                        <p className="text-neutral-400">{k === 4 ? "4+" : k}</p>
                        <p className="text-white font-bold">{pct.toFixed(1)}%</p>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold mb-1">
                  Average rarity in hand
                </p>
                <div className="grid grid-cols-5 gap-1.5 text-[11px]">
                  {(["C", "UC", "R", "SR", "SEC"] as const).map((r) => (
                    <div key={r} className="bg-neutral-900 rounded p-1.5 text-center">
                      <p className="text-neutral-400">{r}</p>
                      <p className="text-white font-bold">{simResult.avgRarity[r].toFixed(2)}</p>
                    </div>
                  ))}
                </div>
              </div>
              <p className="text-[10px] text-neutral-600 italic">
                Based on {simResult.trials.toLocaleString()} Fisher-Yates shuffles of your current deck.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
