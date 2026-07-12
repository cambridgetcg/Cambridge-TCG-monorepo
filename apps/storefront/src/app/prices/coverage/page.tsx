import type { Metadata } from "next";
import Link from "next/link";
import { Audience } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Aggregator coverage withheld — Cambridge TCG",
  description:
    "Counts and rollups derived from restricted upstream observations are withheld under the current source-rights review.",
  robots: { index: false, follow: true },
};

export default function CoverageMapPage() {
  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <Audience kind="public-documentation" contexts={["prices", "coverage", "rights-gap"]} />
      <nav className="mb-8 text-sm text-ink-muted" aria-label="Breadcrumb">
        <Link href="/prices" className="hover:text-ink">Price data</Link>
        <span className="mx-2">/</span>
        <span className="text-ink">Coverage</span>
      </nav>
      <h1 className="text-3xl font-bold text-ink mb-4">Aggregator coverage withheld</h1>
      <p className="text-ink-muted leading-relaxed mb-6">
        Observation counts, distinct-card counts, date ranges, freshness
        rollups, and game-by-source matrices are aggregates of restricted
        upstream records. Publishing the aggregate can disclose collection
        membership and activity even without publishing a price, so the
        current public response is deliberately value-free.
      </p>
      <p className="rounded-lg border border-border-subtle bg-surface p-5 text-sm text-ink-muted mb-8">
        The source registry remains public because it reports Cambridge&apos;s
        reviewed access and rights decision, not the contents of an upstream
        dataset.
      </p>
      <Link href="/api/v1/sources" className="inline-block rounded border border-border-subtle px-4 py-2 text-sm hover:border-border-strong">
        Open source registry
      </Link>
    </main>
  );
}
