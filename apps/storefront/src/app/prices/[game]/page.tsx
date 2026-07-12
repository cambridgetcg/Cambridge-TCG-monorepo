/**
 * Per-game price-guide boundary.
 *
 * Imported catalog and price fields are not public until field-level lineage
 * proves an affirmative reuse right. Keep the route useful as an explanation
 * and navigation surface without querying or ranking restricted rows.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Audience } from "@/lib/ui";
import { getPriceGuideConfig } from "@/lib/prices/games-config";

interface PageProps {
  params: Promise<{ game: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game } = await params;
  const config = getPriceGuideConfig(game);
  return {
    title: config
      ? `${config.short_name} data rights gap — Cambridge TCG`
      : "Price guide not found — Cambridge TCG",
    description:
      "Imported catalog values and upstream price observations are withheld pending affirmative public reuse rights.",
    robots: { index: false, follow: true },
  };
}

export default async function PriceGuidePerGamePage({ params }: PageProps) {
  const { game } = await params;
  const config = getPriceGuideConfig(game);
  if (!config) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", game, "rights-gap"]} />
      <nav className="mb-8 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href="/prices" className="hover:text-ink">Price guides</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">{config.short_name}</span>
      </nav>

      <h1 className="text-3xl font-bold text-ink mb-4">
        {config.short_name} public data boundary
      </h1>
      <p className="text-ink-muted leading-relaxed mb-6">
        The current source registry does not grant Cambridge TCG affirmative
        public reuse rights for imported card names, set titles, images,
        rarities, reference prices, price-derived rankings, or catalog
        aggregates. This page therefore does not query or publish them.
      </p>

      <div className="rounded-lg border border-border-subtle bg-surface p-5 mb-8">
        <h2 className="font-semibold text-ink mb-2">What remains available</h2>
        <ul className="list-disc pl-5 space-y-2 text-sm text-ink-muted">
          <li>Cambridge canonical SKUs already supplied by a caller.</li>
          <li>First-party collector bids, asks, and trades submitted to Cambridge TCG.</li>
          <li>Machine-readable source-rights decisions and named omissions.</li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/market" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Collector market
        </Link>
        <Link href="/api/v1/sources" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Source registry
        </Link>
        <Link href="/licenses" className="rounded border border-border-subtle px-4 py-2 hover:border-border-strong">
          Rights and licences
        </Link>
      </div>
    </main>
  );
}
