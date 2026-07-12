import type { Metadata } from "next";
import Link from "next/link";
import { Audience } from "@/lib/ui";
import { PRICE_GUIDE_GAMES } from "@/lib/prices/games-config";

export const metadata: Metadata = {
  title: "Public price-data boundary — Cambridge TCG",
  description:
    "Upstream catalog values, price observations, aggregates, and rankings are withheld pending affirmative public reuse rights.",
  robots: { index: false, follow: true },
};

export default function PricesLandingPage() {
  const games = [...PRICE_GUIDE_GAMES].sort(
    (left, right) => left.display_priority - right.display_priority,
  );

  return (
    <main className="max-w-4xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", "rights-gap"]} />
      <h1 className="text-3xl font-bold text-ink mb-4">Public price-data boundary</h1>
      <p className="text-ink-muted leading-relaxed max-w-3xl mb-6">
        Cambridge TCG does not currently publish imported card names, set
        titles, images, rarities, wholesale reference prices, upstream price
        history, catalog counts, or rankings. Public reachability is not a
        reuse licence, and a hidden magnitude can still leak through rank or
        aggregate membership.
      </p>

      <div className="rounded-lg border border-border-subtle bg-surface p-5 mb-10">
        <h2 className="font-semibold text-ink mb-2">Public-safe surfaces</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted">
          <li>Canonical Cambridge SKUs and identifiers derived from them.</li>
          <li>First-party collector bids, asks, and completed trades.</li>
          <li>Value-free source status, rights evidence, and named omissions.</li>
        </ul>
      </div>

      <section className="mb-10">
        <h2 className="text-xl font-semibold text-ink mb-4">Structural game routes</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <Link
              key={game.slug}
              href={`/prices/${game.slug}`}
              className="rounded-lg border border-border-subtle bg-surface p-4 hover:border-border-strong"
            >
              <div className="font-semibold text-ink">{game.display_name}</div>
              <div className="mt-1 text-xs font-mono text-ink-faint">{game.game_code}</div>
            </Link>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/prices/search" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Search boundary (paused)
        </Link>
        <Link href="/market" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Collector market
        </Link>
        <Link href="/api/v1/sources" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Source registry
        </Link>
      </div>
    </main>
  );
}
