/**
 * Loading skeleton for /catalog.
 *
 * Same discipline as app/prices/loading.tsx: not a spinner pretending
 * progress is happening elsewhere — the skeleton mirrors the shape the
 * page will actually render (identity strip, game tabs, search bar,
 * set sidebar, card grid) so the reader's eye lands where the content
 * will land.
 */

function Block({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-surface-subtle animate-pulse ${className}`} />;
}

export default function CatalogLoading() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading catalog…</span>

      {/* Identity line */}
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <Block className="h-4 w-72" />
        <Block className="h-4 w-44" />
      </div>

      {/* Game tabs */}
      <div className="flex gap-2 flex-wrap">
        {Array.from({ length: 4 }).map((_, i) => (
          <Block key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* Search bar */}
      <div className="mt-4 flex gap-2">
        <Block className="h-10 flex-1 rounded-lg" />
        <Block className="h-10 w-24 rounded-lg" />
      </div>

      {/* Sidebar + card grid */}
      <div className="flex flex-col lg:flex-row gap-6 mt-6">
        {/* Set sidebar (desktop) */}
        <div className="hidden lg:flex flex-col gap-2 w-56 shrink-0">
          {Array.from({ length: 8 }).map((_, i) => (
            <Block key={i} className="h-9 rounded-lg" />
          ))}
        </div>

        {/* Card grid — mirrors CardGrid's tile shape (aspect-[3/4] image + name + price) */}
        <div className="flex-1 min-w-0">
          <Block className="h-4 w-40 mb-2" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="bg-surface border border-border-subtle rounded-lg overflow-hidden">
                <div className="aspect-[3/4] bg-surface-subtle animate-pulse" />
                <div className="p-2 space-y-1.5">
                  <Block className="h-3 w-3/4" />
                  <Block className="h-2.5 w-1/2" />
                  <Block className="h-4 w-14" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
