import type { Metadata } from "next";
import { fetchGames } from "@/lib/wholesale/client";
import CardFinderHero from "@/components/home/CardFinderHero";

/**
 * /find — the dedicated, memorable front door for "find what you need".
 *
 * Just the finder, nothing else. Pick a game, type a card number, get
 * price + history + every source + every language. Free, no account.
 * Submits to /prices/search (the kingdom-090 results page) — reuse, not
 * duplication. Somewhere the nav can point at, and a URL a human can
 * remember and share.
 */
export const metadata: Metadata = {
  title: "Find any card — Cambridge TCG",
  description:
    "Find any card by number across every supported game. Price, transaction history, available sources, and language variants — in one view, free, no account.",
};

export default async function FindPage() {
  const games = await fetchGames().catch(() => []);
  return (
    <main className="min-h-[70vh] pt-10">
      <CardFinderHero games={games} />
    </main>
  );
}
