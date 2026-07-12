import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Card price detail paused — Cambridge TCG",
  description: "Catalog-backed card detail is paused pending affirmative membership lineage.",
  robots: { index: false, follow: false },
};

export default async function CardPriceGuidePage({ params }: { params: Promise<{ game: string; set: string; number: string }> }) {
  const { game, set, number } = await params;
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-ink">
      <p className="font-mono text-xs text-ink-faint">{game} / {set} / {number} · caller supplied</p>
      <h1 className="mt-2 text-3xl font-semibold">Card price detail is paused</h1>
      <p className="mt-4 text-ink-muted">
        No catalog existence, SKU, set membership, display field, price,
        source signal, or history is loaded by this page.
      </p>
      <Link href="/prices" className="mt-6 inline-flex text-accent">Back to prices →</Link>
    </main>
  );
}
