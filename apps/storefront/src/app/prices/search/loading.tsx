/**
 * Search-shaped skeleton for /prices/search.
 *
 * Without this, in-app navigations (clicking a variant card, a match
 * row, a pagination link) fell back to the parent /prices skeleton —
 * which is shaped like the games-landing grid, so mid-search the form
 * vanished and a game-tile grid flashed in. This skeleton mirrors the
 * page's real anatomy: header, form, then result cards.
 */

export default function PriceSearchLoading() {
  return (
    <main className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-pulse">
      {/* PageHeader */}
      <div className="space-y-2">
        <div className="h-8 w-48 rounded bg-neutral-800" />
        <div className="h-4 w-full max-w-2xl rounded bg-neutral-900" />
      </div>

      {/* SearchForm card */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="grid grid-cols-1 md:grid-cols-[180px_1fr_140px_auto] gap-3 items-end">
          <div className="space-y-1">
            <div className="h-3 w-12 rounded bg-neutral-800" />
            <div className="h-9 rounded-lg bg-neutral-800" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-32 rounded bg-neutral-800" />
            <div className="h-9 rounded-lg bg-neutral-800" />
          </div>
          <div className="space-y-1">
            <div className="h-3 w-20 rounded bg-neutral-800" />
            <div className="h-9 rounded-lg bg-neutral-800" />
          </div>
          <div className="h-9 w-24 rounded-lg bg-neutral-800" />
        </div>
      </div>

      {/* Result cards */}
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4">
        <div className="flex gap-4">
          <div className="h-42 w-30 rounded bg-neutral-800" style={{ height: 168, width: 120 }} />
          <div className="flex-1 space-y-3 py-1">
            <div className="h-6 w-2/3 rounded bg-neutral-800" />
            <div className="h-4 w-1/3 rounded bg-neutral-900" />
            <div className="h-4 w-1/2 rounded bg-neutral-900" />
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 space-y-3">
        <div className="h-5 w-40 rounded bg-neutral-800" />
        <div className="h-4 w-full rounded bg-neutral-900" />
        <div className="h-4 w-full rounded bg-neutral-900" />
        <div className="h-4 w-3/4 rounded bg-neutral-900" />
      </div>
    </main>
  );
}
