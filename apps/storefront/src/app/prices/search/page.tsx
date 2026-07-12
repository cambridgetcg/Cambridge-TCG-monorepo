import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Card search paused — Cambridge TCG",
  description: "Catalog-backed card search is paused pending affirmative membership lineage.",
  robots: { index: false, follow: false },
};

export default function PriceSearchPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 text-ink">
      <h1 className="text-3xl font-semibold">Card search is paused</h1>
      <p className="mt-4 text-ink-muted">
        This page performs no catalog query and returns no match, no-match,
        SKU, set, card-number, or price assertion while membership lineage is
        unresolved.
      </p>
      <Link href="/prices" className="mt-6 inline-flex text-accent">Back to the price-guide boundary →</Link>
    </main>
  );
}
