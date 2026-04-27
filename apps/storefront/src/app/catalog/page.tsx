import { fetchPrices, fetchGames, fetchSets } from "@/lib/wholesale/client";
import type { PriceItem, SetItem } from "@/lib/wholesale/client";
import { formatPrice } from "@/lib/format";
import CardGrid from "@/components/catalog/CardGrid";
import CatalogFilters from "@/components/catalog/CatalogFilters";
import SetSidebar from "@/components/catalog/SetSidebar";
import Pagination from "@/components/catalog/Pagination";
import Link from "next/link";

interface CatalogParams {
  game?: string;
  set?: string;
  q?: string;
  page?: string;
  sort?: string;
  in_stock?: string;
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<CatalogParams>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page || "1") || 1);
  const PER_PAGE = 48;

  // In-stock default logic:
  // - Default: always show in-stock cards unless explicitly toggled off
  // - "false" param = show all cards (user manually clicked "Show All")
  const hasGame = !!params.game;
  const hasSet = !!params.set;
  let effectiveInStock: boolean | undefined;

  if (params.in_stock === "false") {
    effectiveInStock = undefined; // show all
  } else {
    effectiveInStock = true; // default: in-stock only
  }

  // Fetch data in parallel
  const [prices, allGames, sets] = await Promise.all([
    (hasGame || params.q)
      ? fetchPrices({
          game: params.game,
          set: params.set,
          q: params.q,
          sort: params.sort,
          in_stock: effectiveInStock,
          limit: PER_PAGE,
          offset: (page - 1) * PER_PAGE,
        }).catch((): { count: number; total: number; channel: string; items: PriceItem[] } => ({
          count: 0, total: 0, channel: "", items: [],
        }))
      : Promise.resolve({ count: 0, total: 0, channel: "", items: [] as PriceItem[] }),
    fetchGames().catch(() => []),
    params.game ? fetchSets(params.game).catch(() => []) : Promise.resolve([] as SetItem[]),
  ]);

  // Find selected set info
  const selectedSet = params.set
    ? sets.find((s) => s.code === params.set) ?? null
    : null;

  // Extract unique rarities from current result set
  const rarities = [
    ...new Set(
      prices.items
        .map((c) => c.rarity)
        .filter((r): r is string => !!r)
    ),
  ].sort();

  // Determine if in-stock filter is actively filtering (either explicit or default)
  const isFilteringInStock = effectiveInStock === true;
  // Was the in-stock filter applied by default (not explicitly set by user)?
  const isDefaultInStock = isFilteringInStock && !params.in_stock && hasGame && !hasSet;

  // Show landing view when no game is selected and no search query
  const showLanding = !params.game && !params.q;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Level 1: Game tabs */}
      <CatalogFilters
        games={allGames}
        current={params}
        rarities={rarities}
        effectiveInStock={isFilteringInStock}
        hasSet={hasSet}
      />

      {/* Search bar */}
      <CatalogSearch current={params} />

      {showLanding ? (
        /* Landing view */
        <div className="mt-12">
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
              3,000+ Japanese One Piece Cards.
            </h1>
            <p className="text-lg text-neutral-400">
              Sourced direct from CardRush. Near Mint. Fast UK shipping.
            </p>
          </div>

          {/* Quick-jump buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 mb-12">
            {[
              { code: "OP01", label: "Romance Dawn" },
              { code: "OP05", label: "Awakening of the New Era" },
              { code: "OP10", label: "Royal Blood" },
            ].map((set) => (
              <Link
                key={set.code}
                href={`/catalog?game=one-piece&set=${set.code}`}
                className="px-5 py-3 bg-neutral-900 hover:bg-neutral-800 rounded-xl text-white font-medium transition-all duration-200 hover:ring-2 ring-emerald-500"
              >
                <span className="font-mono text-emerald-400 text-xs mr-2">{set.code}</span>
                {set.label}
              </Link>
            ))}
          </div>

          {/* Browse all sets prompt */}
          <div className="text-center">
            <Link
              href="/catalog?game=one-piece"
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition"
            >
              Browse All Sets
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </div>
        </div>
      ) : (
        /* Card grid view */
        <div className="flex flex-col lg:flex-row gap-6 mt-6">
          {/* Set sidebar — only when a game is selected */}
          {params.game && sets.length > 0 && (
            <SetSidebar
              sets={sets}
              currentGame={params.game}
              currentSet={params.set}
            />
          )}

          {/* Main content area */}
          <div className="flex-1 min-w-0">
            {/* Set header */}
            {selectedSet && (
              <div className="mb-4 pb-4 border-b border-neutral-800">
                <h1 className="text-2xl font-bold text-white">{selectedSet.name}</h1>
                <div className="flex items-center gap-4 mt-1 text-sm text-neutral-400">
                  <span className="font-mono bg-neutral-800 px-2 py-0.5 rounded text-xs">
                    {selectedSet.code}
                  </span>
                  <span>{selectedSet.card_count} cards</span>
                  {selectedSet.release_date && (
                    <span>Released {selectedSet.release_date}</span>
                  )}
                </div>
              </div>
            )}

            {/* In-stock filter banner */}
            {isFilteringInStock && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-sm">
                <span className="text-emerald-400">
                  Showing in-stock cards only
                </span>
                <span className="text-neutral-500">·</span>
                <Link
                  href={buildShowAllHref(params)}
                  className="text-neutral-400 hover:text-white transition underline underline-offset-2"
                >
                  Show all
                </Link>
              </div>
            )}

            {/* Results count */}
            <p className="text-sm text-neutral-500 mb-2">
              Showing {Math.min(prices.count, PER_PAGE)} of{" "}
              {prices.total.toLocaleString()} {prices.total === 1 ? "card" : "cards"}
            </p>

            <CardGrid cards={prices.items} />
            <Pagination
              total={prices.total}
              page={page}
              perPage={PER_PAGE}
              searchParams={{ ...params }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function buildShowAllHref(params: CatalogParams): string {
  const sp = new URLSearchParams();
  if (params.game) sp.set("game", params.game);
  if (params.set) sp.set("set", params.set);
  if (params.q) sp.set("q", params.q);
  if (params.sort) sp.set("sort", params.sort);
  sp.set("in_stock", "false");
  return `/catalog?${sp.toString()}`;
}

function CatalogSearch({
  current,
}: {
  current: { q?: string; game?: string; set?: string };
}) {
  return (
    <form action="/catalog" className="mt-4">
      {current.game && <input type="hidden" name="game" value={current.game} />}
      {current.set && <input type="hidden" name="set" value={current.set} />}
      <div className="flex gap-2">
        <input
          type="text"
          name="q"
          defaultValue={current.q || ""}
          placeholder="Search cards..."
          className="flex-1 px-4 py-2 bg-neutral-900 border border-neutral-700 rounded-lg text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <button
          type="submit"
          className="px-6 py-2 bg-emerald-500 text-black font-medium rounded-lg hover:bg-emerald-400 transition"
        >
          Search
        </button>
      </div>
    </form>
  );
}
