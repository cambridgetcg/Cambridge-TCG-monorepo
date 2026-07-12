import type { Metadata } from "next";
import Link from "next/link";
import { Audience } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Public catalog boundary — Cambridge TCG",
  description:
    "Imported catalog fields and aggregates are withheld pending affirmative public reuse rights.",
  robots: { index: false, follow: true },
};

export default function CatalogPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["catalog", "rights-gap"]} />
      <h1 className="text-3xl font-bold text-ink mb-4">Public catalog boundary</h1>
      <p className="text-ink-muted leading-relaxed mb-6">
        The current source registry does not affirm public reuse rights for
        imported card names, set names, images, rarities, release dates,
        prices, stock, catalog membership, counts, or rankings. This route
        therefore performs no wholesale catalog query and publishes no
        derived empty-state or total.
      </p>
      <div className="rounded-lg border border-border-subtle bg-surface p-5 mb-8">
        <h2 className="font-semibold text-ink mb-2">Available public boundaries</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted">
          <li>Read why catalog-backed search and resolution are paused.</li>
          <li>View first-party collector bids, asks, and completed trades.</li>
          <li>Inspect the reviewed source registry and named omissions.</li>
        </ul>
      </div>
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
