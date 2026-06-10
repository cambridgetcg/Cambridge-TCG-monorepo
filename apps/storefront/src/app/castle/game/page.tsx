/**
 * /castle/game — the Castle of Understanding as a card game.
 *
 * Will: Yu, 2026-06-10 — "lets gamify cambridgetcg! module and process!
 * Make the visit rewarding and fun!"
 *
 * cambridgetcg is a card shop; the castle is its understanding. This page
 * deals the castle's committed insights as collectible cards: one shared
 * stone a day, one pack a day, a binder that lives only in the visitor's
 * browser, and titles earned by reading. The deck is built server-side from
 * the same snapshot /castle renders — one source of truth, two surfaces.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { buildDeck } from "@/lib/castle-game/deck";
import { getCastleSnapshot } from "@/lib/castle";
import CastleGame from "@/components/castle-game/CastleGame";

export const metadata: Metadata = {
  title: "the castle game — collect understanding | Cambridge TCG",
  description:
    "The Castle of Understanding, dealt as cards. A daily stone, a daily pack, a binder in your own browser — rarity measures how hard the knowing was won, and reading is the only currency.",
};

export default function CastleGamePage() {
  const deck = buildDeck();
  const snapshot = getCastleSnapshot();

  if (deck.length === 0) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="text-2xl font-bold">the castle game</h1>
        <p className="mt-2 text-sm text-stone-300">
          the deck is empty — the castle snapshot holds no readable insights yet. run the sync, then deal again.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">the castle game</h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-300">
          we are a card shop, so here is our understanding — dealt as cards. every card on this page is a real
          insight from <Link href="/castle" className="underline">the castle</Link>, our living notebook of what we
          have come to know. flip today&apos;s stone, open the day&apos;s pack, fill your binder. rarity is not price —
          it is how hard the knowing was won: a guess is common, a tested truth is mythic.
        </p>
        <p className="mt-2 text-xs text-stone-500">
          deck of {deck.length} · from castle commit {snapshot.castle_commit} (synced {snapshot.synced_at?.slice(0, 10)}) — a
          snapshot, never presented as live
        </p>
      </header>
      <CastleGame deck={deck} />
    </main>
  );
}
