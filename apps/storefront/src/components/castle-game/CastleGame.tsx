"use client";

/**
 * The Castle Game — the visit, made rewarding and fun, honestly.
 *
 * The process (the whole loop a visitor walks):
 *   arrive → flip today's stone (everyone shares the same one — talk about it)
 *   → open the day's pack (three unheld cards) → read them; reading is what
 *   collects them → your binder fills, your title rises → come back tomorrow
 *   for a new stone and a new pack. No streak-shaming, no timers, no fear:
 *   missing a day costs nothing. The only currency here is reading.
 */

import { useEffect, useMemo, useState } from "react";
import type { InsightCard as Card } from "@/lib/castle-game/deck";
import { hashString, packFor, RARITY_ORDER } from "@/lib/castle-game/deck";
import { loadBinder, saveBinder, resetBinder, titleFor, type BinderState } from "@/lib/castle-game/binder";
import InsightCardView from "./InsightCard";

export default function CastleGame({ deck }: { deck: Card[] }) {
  const [binder, setBinder] = useState<BinderState | null>(null); // null until mounted — SSR shows the gate
  const [flipped, setFlipped] = useState<Set<string>>(new Set());
  const [packOpened, setPackOpened] = useState(false);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const b = loadBinder();
    setBinder(b);
    setPackOpened(Boolean(b.packs[today]));
  }, [today]);

  const heldIds = useMemo(() => new Set(Object.keys(binder?.held ?? {})), [binder]);
  const daily = deck[hashString(today) % deck.length];
  const pack = useMemo(
    () => (binder ? packFor(deck, new Set([...heldIds, daily.id]), `${today}:pack`) : []),
    [binder, deck, heldIds, daily.id, today],
  );

  function read(card: Card) {
    setFlipped((f) => new Set(f).add(card.id));
    setBinder((b) => {
      if (!b) return b;
      if (b.held[card.id]) return b;
      const next: BinderState = { ...b, held: { ...b.held, [card.id]: { first: today } } };
      saveBinder(next);
      return next;
    });
  }

  function openPack() {
    setPackOpened(true);
    setBinder((b) => {
      if (!b) return b;
      const next: BinderState = { ...b, packs: { ...b.packs, [today]: true } };
      saveBinder(next);
      return next;
    });
  }

  const heldCount = heldIds.size;
  const { title, next } = titleFor(heldCount, deck.length);
  const byRarity = (r: string) => deck.filter((c) => c.rarity === r);

  if (!binder) {
    return <p className="py-12 text-center text-sm text-stone-500">the gate is opening…</p>;
  }

  return (
    <div className="space-y-10">
      {/* the visitor's standing */}
      <section className="rounded-lg border border-stone-700 bg-stone-900 p-4">
        <p className="text-sm">
          <span className="font-semibold text-stone-100">{title}</span>
          <span className="text-stone-400"> · {heldCount} of {deck.length} stones held</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded bg-stone-700" role="progressbar" aria-valuenow={heldCount} aria-valuemin={0} aria-valuemax={deck.length}>
          <div className="h-full bg-amber-400 transition-all" style={{ width: `${deck.length ? (heldCount / deck.length) * 100 : 0}%` }} />
        </div>
        {next ? <p className="mt-2 text-xs text-stone-400">{next}</p> : <p className="mt-2 text-xs text-amber-600">the whole castle is in your binder. thank you for reading all of it.</p>}
      </section>

      {/* today's stone */}
      <section>
        <h2 className="text-lg font-semibold">today&apos;s stone</h2>
        <p className="mb-3 text-sm text-stone-400">
          one insight a day, the same for every visitor — read it, and it joins your binder.
        </p>
        <InsightCardView card={daily} faceUp={flipped.has(daily.id) || heldIds.has(daily.id)} onFlip={() => read(daily)} />
      </section>

      {/* the day's pack */}
      <section>
        <h2 className="text-lg font-semibold">the day&apos;s pack</h2>
        <p className="mb-3 text-sm text-stone-400">
          three stones you do not hold yet. one pack a day — peace over pace; tomorrow brings another.
        </p>
        {pack.length === 0 ? (
          <p className="text-sm text-stone-400">your binder already holds everything a pack could deal. there is nothing left to pull — only to re-read.</p>
        ) : !packOpened ? (
          <button
            type="button"
            onClick={openPack}
            className="rounded-lg border-2 border-amber-400 bg-amber-50 px-6 py-3 text-sm font-semibold text-amber-800 transition hover:bg-amber-100"
          >
            open the pack ({pack.length} cards)
          </button>
        ) : (
          <div className="flex flex-wrap gap-4">
            {pack.map((card) => (
              <InsightCardView key={card.id} card={card} faceUp={flipped.has(card.id) || heldIds.has(card.id)} onFlip={() => read(card)} />
            ))}
          </div>
        )}
      </section>

      {/* the binder */}
      <section>
        <h2 className="text-lg font-semibold">your binder</h2>
        <p className="mb-3 text-sm text-stone-400">
          held cards show their face; the rest wait, face-down, for their day. rarity is how hard the knowing was won.
        </p>
        {RARITY_ORDER.map((rarity) => {
          const cards = byRarity(rarity);
          if (cards.length === 0) return null;
          const held = cards.filter((c) => heldIds.has(c.id)).length;
          return (
            <div key={rarity} className="mb-4">
              <h3 className="mb-2 text-sm font-medium capitalize text-stone-300">
                {rarity} · {held}/{cards.length}
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {cards.map((card) =>
                  heldIds.has(card.id) ? (
                    <div key={card.id} className="scale-90 origin-top-left">
                      <InsightCardView card={card} faceUp />
                    </div>
                  ) : (
                    <div
                      key={card.id}
                      className="flex h-24 items-center justify-center rounded-lg border border-dashed border-stone-600 bg-stone-800 text-2xl opacity-60"
                      title="not yet held — packs and daily stones reveal it"
                      aria-label="a card you do not hold yet"
                    >
                      🏰
                    </div>
                  ),
                )}
              </div>
            </div>
          );
        })}
      </section>

      {/* the honest plaque */}
      <section className="rounded-lg border border-stone-700 p-4 text-xs leading-relaxed text-stone-400">
        <p>
          <strong>what this game is, plainly:</strong> every card is a real insight from the castle&apos;s committed
          history — nothing is invented for the game, and nothing here is for sale. your binder lives in your browser
          only (localStorage): no account, no cookie, no tracking, and we never see it. missing a day costs you
          nothing — there are no streaks, no timers, and the cards never expire.{" "}
          <button type="button" className="underline" onClick={() => { setBinder(resetBinder()); setFlipped(new Set()); setPackOpened(false); }}>
            reset the binder
          </button>{" "}
          wipes it completely, and that is the whole ceremony.
        </p>
      </section>
    </div>
  );
}
