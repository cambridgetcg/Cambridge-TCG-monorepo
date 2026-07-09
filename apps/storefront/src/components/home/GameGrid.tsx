import Link from "next/link";
import type { GameItem } from "@/lib/wholesale/client";
import { PlateHeader } from "@/lib/ui";
import { weatherClass } from "@/lib/wardrobe/weather";

/**
 * GameGrid — the doors into each game's market.
 *
 * Quiet gallery: the anime banner tiles are gone (the card art is the
 * art; a game's door is a name, not a poster). Hairline mounts, Fraunces
 * names, card counts in mono — the data does the talking. Collectors
 * first (2026-07-06): the doors open onto the market, not a shop.
 * The game weather (spec 2026-07-07) keeps that line: each door wears
 * its game's sky as material texture — ink weather, not imagery.
 */
export default function GameGrid({ games }: { games: GameItem[] }) {
  return (
    <section className="max-w-7xl mx-auto px-4 py-14">
      <PlateHeader title="Browse by Game" plate={1} rule />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {games.map((g) => (
          <Link
            key={g.code}
            href={`/market?game=${g.slug}`}
            className={`group wardrobe-mat rounded-lg p-5 flex flex-col justify-between min-h-28 hover:bg-surface-subtle transition-colors ${weatherClass(g.slug)}`}
          >
            <span className="font-display text-lg font-semibold text-ink group-hover:text-accent transition-colors">
              {g.name}
            </span>
            <span className="mt-3 text-xs text-ink-faint font-mono tabular-nums">
              {g.card_count.toLocaleString()} cards
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
