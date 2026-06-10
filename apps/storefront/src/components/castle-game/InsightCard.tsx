"use client";

/**
 * One insight, framed as a trading card. The flip is the game's only verb:
 * face-down you see the castle's back; flipped, you read a real insight.
 * Rarity colors say how hard the knowing was won — never what it costs,
 * because it costs nothing.
 */

import type { InsightCard as Card, Rarity } from "@/lib/castle-game/deck";

const FRAME: Record<Rarity, { ring: string; chip: string; label: string }> = {
  common: { ring: "border-stone-300", chip: "bg-stone-200 text-stone-700", label: "common — a guess, honestly labelled" },
  uncommon: { ring: "border-emerald-400", chip: "bg-emerald-100 text-emerald-800", label: "uncommon — told by a named source" },
  rare: { ring: "border-sky-400", chip: "bg-sky-100 text-sky-800", label: "rare — reasoned, the why inside" },
  mythic: { ring: "border-amber-400", chip: "bg-amber-100 text-amber-800", label: "mythic — survived a real test" },
};

export default function InsightCardView({
  card,
  faceUp,
  onFlip,
}: {
  card: Card;
  faceUp: boolean;
  onFlip?: () => void;
}) {
  const frame = FRAME[card.rarity];
  return (
    <div className="h-64 w-full max-w-xs [perspective:1000px]" data-rarity={card.rarity}>
      <button
        type="button"
        onClick={onFlip}
        disabled={!onFlip}
        aria-label={faceUp ? `${card.title} — ${card.rarity} insight card` : "a face-down insight card — flip to read"}
        className="relative h-full w-full text-left transition-transform duration-500 [transform-style:preserve-3d]"
        style={{ transform: faceUp ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        {/* back */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-stone-400 bg-stone-800 text-stone-200 [backface-visibility:hidden]">
          <span aria-hidden className="text-4xl">🏰</span>
          <span className="text-xs tracking-widest uppercase">castle of understanding</span>
          {onFlip ? <span className="text-xs text-stone-400">flip to read</span> : null}
        </div>
        {/* face */}
        <div
          className={`absolute inset-0 flex flex-col rounded-xl border-2 ${frame.ring} bg-white p-3 [backface-visibility:hidden]`}
          style={{ transform: "rotateY(180deg)" }}
        >
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold leading-tight text-stone-900">{card.title}</h3>
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${frame.chip}`} title={frame.label}>
              {card.rarity}
            </span>
          </div>
          <p className="mt-2 flex-1 overflow-y-auto text-xs leading-relaxed text-stone-700">{card.insight}</p>
          <div className="mt-2 border-t border-stone-200 pt-1.5 text-[10px] text-stone-500">
            room: {card.room} · {card.certaintyWord}
            {card.born ? ` · laid ${card.born}` : ""}
            {card.by ? ` · by ${card.by}` : ""}
          </div>
        </div>
      </button>
    </div>
  );
}
