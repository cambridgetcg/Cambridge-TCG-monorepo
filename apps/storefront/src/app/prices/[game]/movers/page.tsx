/** Value-free movers route: restricted prices cannot leak through ranking. */

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
      ? `${config.short_name} movers withheld — Cambridge TCG`
      : "Movers not found — Cambridge TCG",
    description:
      "Upstream price-derived movers and rankings are withheld under the current source-rights review.",
    robots: { index: false, follow: true },
  };
}

export default async function GameMoversPage({ params }: PageProps) {
  const { game } = await params;
  const config = getPriceGuideConfig(game);
  if (!config) notFound();

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", game, "movers", "rights-gap"]} />
      <nav className="mb-8 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href={`/prices/${game}`} className="hover:text-ink">{config.short_name}</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Movers</span>
      </nav>
      <h1 className="text-3xl font-bold text-ink mb-4">Price movers withheld</h1>
      <p className="text-ink-muted leading-relaxed mb-6">
        A mover list leaks restricted observations through direction,
        magnitude, membership, and rank even when the underlying prices are
        hidden. Cambridge TCG therefore publishes no upstream-derived movers
        or fallback “most valuable” table under the current rights decision.
      </p>
      <p className="rounded-lg border border-border-subtle bg-surface p-5 text-sm text-ink-muted mb-8">
        First-party collector bids, asks, and completed trades remain separate
        from upstream price feeds and can be viewed on the collector market.
      </p>
      <div className="flex flex-wrap gap-3 text-sm">
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
