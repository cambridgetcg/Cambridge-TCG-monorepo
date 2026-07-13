import type { Metadata } from "next";
import { fetchGames } from "@/lib/wholesale/client";
import CardFinderHero from "@/components/home/CardFinderHero";

/**
 * /find — the dedicated, memorable front door for "find what you need".
 *
 * Just the finder, nothing else. Pick a game, type a card number, get
 * structural identity + available source status + known languages. Free, no account.
 * Submits to /prices/search (the kingdom-090 results page) — reuse, not
 * duplication. Somewhere the nav can point at, and a URL a human can
 * remember and share.
 */
export const metadata: Metadata = {
  title: "Find any card — Cambridge TCG",
  description:
    "Find structural card fields by number across supported games. Legacy prices, images, and transaction history are withheld; source status and known language variants remain visible.",
};

export default async function FindPage() {
  const games = await fetchGames().catch(() => []);
  return (
    <main className="min-h-[70vh] pt-10">
      <CardFinderHero games={games} />
    </main>
  );
}
