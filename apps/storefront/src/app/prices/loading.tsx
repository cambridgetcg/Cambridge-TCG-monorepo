/**
 * Shared loading skeleton for the /prices/* tree.
 *
 * Next.js renders this while any child route's data is suspending. Same
 * visual language as the real pages (max-w-5xl, neutral-900 cards,
 * accent placeholders) so the transition doesn't jar.
 *
 * Substrate-honest: not a fake spinner that pretends progress is happening
 * elsewhere. The skeleton mirrors the actual shape the page will render —
 * a breadcrumb-shaped strip, an h1-shaped block, a sets-grid-shaped block,
 * a top-table-shaped block. The reader's eye lands where the content will
 * land.
 *
 * Kingdom-080 follow-up: applies the Next.js loading.tsx pattern across
 * the price-guide tree (kingdom-084 + kingdom-085 substrate).
 */

function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-surface-elevated/60 animate-pulse ${className}`} />;
}

export default function PricesLoading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading price guide…</span>

      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2">
        <Block className="h-3.5 w-12" />
        <span className="text-neutral-700">/</span>
        <Block className="h-3.5 w-24" />
      </div>

      {/* H1 + provenance pills */}
      <Block className="h-8 w-2/3 mb-4" />
      <div className="mb-10 flex items-center gap-3">
        <Block className="h-5 w-32" />
        <Block className="h-5 w-28" />
        <Block className="h-5 w-36" />
      </div>

      {/* Intro paragraph */}
      <div className="mb-10 space-y-2 max-w-3xl">
        <Block className="h-4 w-full" />
        <Block className="h-4 w-full" />
        <Block className="h-4 w-3/4" />
      </div>

      {/* Section heading */}
      <Block className="h-5 w-40 mb-5" />

      {/* Tile grid (mimics game tiles / sets grid) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-12">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-xl border border-border-subtle bg-surface p-4 space-y-2"
          >
            <Block className="h-5 w-3/4" />
            <Block className="h-3 w-full" />
            <Block className="h-3 w-1/3" />
          </div>
        ))}
      </div>

      {/* Table-shaped skeleton */}
      <Block className="h-5 w-56 mb-5" />
      <div className="rounded-lg border border-border-subtle overflow-hidden">
        <div className="bg-surface-elevated/60 h-9" />
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="bg-surface border-t border-border-subtle px-3 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <Block className="h-3 w-8" />
              <Block className="h-3 w-32" />
            </div>
            <Block className="h-3 w-16" />
          </div>
        ))}
      </div>
    </main>
  );
}
