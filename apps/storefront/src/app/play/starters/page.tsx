import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Starter decks paused — Cambridge TCG",
  description:
    "Starter deck publication is paused pending affirmative decklist and card-metadata lineage.",
  robots: { index: false, follow: false },
};

export default function StartersPage() {
  return (
    <main className="min-h-screen bg-page px-4 py-16 text-ink">
      <section className="mx-auto max-w-2xl rounded-xl border border-border-subtle bg-surface p-8">
        <p className="text-xs uppercase tracking-wider text-ink-faint">Play · starters</p>
        <h1 className="mt-2 text-2xl font-semibold">Starter decks are temporarily paused</h1>
        <p className="mt-4 leading-relaxed text-ink-muted">
          The earlier picker combined upstream decklist references with
          wholesale-resolved card fields. It now loads no starter, product,
          decklist, SKU, name, image, rarity, or catalog membership while we
          establish an affirmative public lineage.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/deck-builder" className="text-accent">Use your own saved deck →</Link>
          <Link href="/play/spec" className="text-accent">Play module status →</Link>
        </div>
      </section>
    </main>
  );
}
