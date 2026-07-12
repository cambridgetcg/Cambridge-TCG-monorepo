"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EmptyState, ErrorAlert, Icon, Money, WhyLink } from "@/lib/ui";
import { useVoice } from "@/lib/wardrobe/context";
import { weatherClass } from "@/lib/wardrobe/weather";
import {
  buildBrowseUrl,
  buildCatalogSearch,
  derivePageStats,
  parseBrowseParams,
  parseCatalogError,
  SORT_OPTIONS,
  DEFAULT_GAME,
  type CatalogCard,
  type CatalogQuery,
  type CatalogResult,
  type CatalogSource,
  type SetInfo,
  type SetsResult,
  type SortKey,
  type ViewMode,
} from "./catalog";

interface MarketBrowserProps {
  initial: CatalogQuery;
  initialCatalog: CatalogResult;
  initialSets: SetsResult;
  /** Pre-rendered server nodes — <Provenance> reads a cookie server-side
   *  and can't render inside this client tree. */
  statsProvenance: ReactNode;
  sourceBadges: Record<CatalogSource, ReactNode>;
}

function queryKey(q: CatalogQuery): string {
  return [q.game, q.q, q.set ?? "", q.sort, q.page].join("|");
}

function listUrl(game: string, sku?: string): string {
  const params = new URLSearchParams();
  if (game !== DEFAULT_GAME) params.set("game", game);
  if (sku) params.set("sku", sku);
  const s = params.toString();
  return s ? `/market/list?${s}` : "/market/list";
}

export default function MarketBrowser({
  initial,
  initialCatalog,
  initialSets,
  statsProvenance,
  sourceBadges,
}: MarketBrowserProps) {
  const v = useVoice();

  const [query, setQuery] = useState<CatalogQuery>(initial);
  const [searchInput, setSearchInput] = useState(initial.q);
  const [catalog, setCatalog] = useState<CatalogResult>(initialCatalog);
  const [loading, setLoading] = useState(false);

  const sets: SetInfo[] = initialSets.ok ? initialSets.sets : [];
  const visibleSets = sets;

  // The SSR pass already fetched `initial` — don't refetch it on mount.
  const lastFetchedKey = useRef(queryKey(initial));
  const abortRef = useRef<AbortController | null>(null);
  const queryRef = useRef(query);
  useEffect(() => {
    queryRef.current = query;
  }, [query]);

  const fetchCatalog = useCallback(async (q: CatalogQuery) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/market/catalog?${buildCatalogSearch(q)}`, {
        signal: controller.signal,
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        const { message, code } = parseCatalogError(body);
        setCatalog({ ok: false, message, code });
      } else {
        setCatalog({
          ok: true,
          cards: body?.cards ?? [],
          returnedCount: body?.returned_count ?? 0,
          hasMore: body?.has_more === true,
          source: (body?.source as CatalogSource) ?? "unavailable",
        });
      }
      setLoading(false);
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // superseded request
      setCatalog({
        ok: false,
        message: "Network problem loading the catalog — the cards are still there. Try again.",
      });
      setLoading(false);
    }
  }, []);

  /** Central state transition: update query, sync the URL, refetch.
   *  Side effects live here, not in a setState updater, so StrictMode's
   *  double-invoked updaters can't double the history entries. */
  const apply = useCallback(
    (patch: Partial<CatalogQuery>, history: "push" | "replace") => {
      const next = { ...queryRef.current, ...patch };
      queryRef.current = next;
      setQuery(next);
      const url = buildBrowseUrl(next);
      if (history === "push") window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
      if (queryKey(next) !== lastFetchedKey.current) {
        lastFetchedKey.current = queryKey(next);
        void fetchCatalog(next);
      }
    },
    [fetchCatalog],
  );

  // Debounced search-as-you-type.
  useEffect(() => {
    if (searchInput === queryRef.current.q) return;
    const t = setTimeout(() => apply({ q: searchInput, page: 1 }, "replace"), 300);
    return () => clearTimeout(t);
  }, [searchInput, apply]);

  // Back/forward: the app router restores the URL only (the pushState in
  // apply() copies the current router tree into every history entry, so
  // popstate triggers no server re-render and the page's `key` never
  // changes). Content must therefore re-seed from the URL here.
  useEffect(() => {
    const onPop = () => {
      const next = parseBrowseParams(new URL(window.location.href).searchParams);
      queryRef.current = next;
      setQuery(next);
      setSearchInput(next.q);
      if (queryKey(next) !== lastFetchedKey.current) {
        lastFetchedKey.current = queryKey(next);
        void fetchCatalog(next);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [fetchCatalog]);

  const cards = catalog.ok ? catalog.cards : [];
  const returnedCount = catalog.ok ? catalog.returnedCount : 0;
  const hasMore = catalog.ok ? catalog.hasMore : false;
  const stats = derivePageStats(cards);

  return (
    <div className={weatherClass(query.game)}>
      {/* ---- Search + sort + view (no-JS fallback: plain GET form) ---- */}
      <form
        action="/market"
        method="get"
        onSubmit={(e) => e.preventDefault()}
        className="flex flex-col sm:flex-row gap-3 mb-4"
      >
        {query.game !== DEFAULT_GAME && <input type="hidden" name="game" value={query.game} />}
        {query.set && <input type="hidden" name="set" value={query.set} />}
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
          <input
            type="search"
            name="q"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search active market SKUs…"
            aria-label="Search active market SKUs"
            className="w-full pl-9 pr-9 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition text-sm"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition text-sm"
            >
              ✕
            </button>
          )}
        </div>

        <select
          value={query.sort}
          onChange={(e) => apply({ sort: e.target.value as SortKey, page: 1 }, "push")}
          aria-label="Sort order"
          className="px-3 py-2.5 bg-surface border border-border-subtle rounded-lg text-ink text-sm focus:outline-none focus:border-accent/50 transition"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <div className="flex bg-surface border border-border-subtle rounded-lg overflow-hidden self-start sm:self-auto">
          {(["table", "grid"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => apply({ view: mode }, "replace")}
              title={mode === "table" ? "Table view" : "Grid view"}
              aria-pressed={query.view === mode}
              className={`px-3 py-2.5 text-sm transition ${
                query.view === mode ? "bg-accent text-page font-bold" : "text-ink-muted hover:text-ink"
              }`}
            >
              <Icon name={mode === "table" ? "list" : "grid"} />
            </button>
          ))}
        </div>
      </form>

      {/* ---- Live stats strip ---- */}
      {catalog.ok && !loading && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mb-5 text-sm">
          <span className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-ink font-semibold font-mono tabular-nums">{returnedCount.toLocaleString()}</span> active SKUs on this page
          </span>
          <span className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-bid font-semibold font-mono tabular-nums">{stats.cardsWithActivity}</span> with open asks or bids
          </span>
          <span className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-ask font-semibold font-mono tabular-nums">{stats.openAskUnits}</span> ask units
          </span>
          <span className="px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-ink-muted">
            <span className="text-info font-semibold font-mono tabular-nums">{stats.openBidUnits}</span> collector bid units
          </span>
          <span className="text-[10px] text-ink-faint flex items-center gap-1.5">
            activity {statsProvenance}
            <WhyLink href="/methodology/market" tooltip="What counts as market activity?" />
            <span aria-hidden>·</span> source {sourceBadges[catalog.source]}
          </span>
        </div>
      )}

      <div className="flex gap-6">
        {/* ---- Set sidebar (desktop) ---- */}
        <aside className="hidden lg:block w-56 shrink-0">
          <h2 className="font-display text-xs font-bold text-ink-faint uppercase tracking-wider mb-3">Sets</h2>
          {!initialSets.ok ? (
            <p className="text-xs text-ink-faint leading-relaxed">
              The set list could not be loaded right now — search still works.
            </p>
          ) : (
            <nav className="flex flex-col gap-1">
              <SetButton active={query.set === null} onClick={() => apply({ set: null, page: 1 }, "push")}>
                All Cards
              </SetButton>
              {visibleSets.map((s) => (
                <SetButton key={s.code} active={query.set === s.code} onClick={() => apply({ set: s.code, page: 1 }, "push")}>
                  <span className="truncate">
                    <span className="text-ink-faint font-mono text-xs mr-1.5">{s.code}</span>
                  </span>
                </SetButton>
              ))}
            </nav>
          )}
        </aside>

        {/* ---- Main content ---- */}
        <div className="flex-1 min-w-0">
          {/* Set scroller (mobile) */}
          {initialSets.ok && visibleSets.length > 0 && (
            <div className="lg:hidden mb-4 -mx-4 px-4">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                <SetPill active={query.set === null} onClick={() => apply({ set: null, page: 1 }, "push")}>
                  All
                </SetPill>
                {visibleSets.map((s) => (
                  <SetPill key={s.code} active={query.set === s.code} onClick={() => apply({ set: s.code, page: 1 }, "push")}>
                    {s.code}
                  </SetPill>
                ))}
              </div>
            </div>
          )}

          {!loading && catalog.ok && (
            <p className="text-xs text-ink-faint mb-3">
              Showing <span className="font-mono tabular-nums">{cards.length}</span> of{" "}
              <span className="font-mono tabular-nums">{returnedCount.toLocaleString()}</span> active SKUs on this page
            </p>
          )}

          {loading && <CatalogSkeleton view={query.view} caption={v("market.loading.catalog")} />}

          {/* Source outage is an error, never an empty catalog. */}
          {!loading && !catalog.ok && (
            <ErrorAlert
              title="Catalog source unavailable"
              description={catalog.message}
              action={
                <button
                  onClick={() => fetchCatalog(query)}
                  className="px-4 py-2 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition text-sm"
                >
                  Try again
                </button>
              }
            />
          )}

          {/* Empty with filters = "nothing matched"; empty with none =
              this game's catalog genuinely holds no cards yet. Say which
              — an unstocked game must not read like a failed search
              (and never like an error; outages take the branch above). */}
          {!loading && catalog.ok && cards.length === 0 && (
            <EmptyState
              title={
                query.q || query.set
                  ? v("market.empty.catalog.title")
                  : "No active collector orders in this game"
              }
              description={
                query.q || query.set
                  ? v("market.empty.catalog.description")
                  : "The first-party order book has no open SKU in this game. This is not a claim about the restricted wholesale catalog."
              }
              action={
                query.q || query.set ? (
                  <button
                    onClick={() => {
                      setSearchInput("");
                      apply({ q: "", set: null, page: 1 }, "push");
                    }}
                    className="px-4 py-2 bg-accent text-page font-bold rounded-lg hover:bg-accent-strong transition text-sm"
                  >
                    Clear filters
                  </button>
                ) : undefined
              }
            />
          )}

          {!loading && catalog.ok && cards.length > 0 && (
            query.view === "table" ? (
              <CatalogTable cards={cards} game={query.game} />
            ) : (
              <CatalogGrid cards={cards} game={query.game} />
            )
          )}

          {/* ---- Pagination ---- */}
          {!loading && catalog.ok && (query.page > 1 || hasMore) && (
            <div className="flex justify-center items-center gap-2 mt-8">
              <button
                onClick={() => apply({ page: Math.max(1, query.page - 1) }, "push")}
                disabled={query.page <= 1}
                className="px-3 py-2 bg-surface border border-border-subtle text-ink-muted rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
              >
                Previous
              </button>
              <span className="text-sm text-ink-muted font-mono">page {query.page}</span>
              <button
                onClick={() => apply({ page: query.page + 1 }, "push")}
                disabled={!hasMore}
                className="px-3 py-2 bg-surface border border-border-subtle text-ink-muted rounded-lg hover:bg-surface-subtle disabled:opacity-40 disabled:cursor-not-allowed transition text-sm"
              >
                Next
              </button>
            </div>
          )}

          {/* Collectors first (2026-07-06): the house buylist card and the
              floating sell-cart bar retired with the we-buy desk. Selling
              happens on the book — list an ask, or answer a collector's bid. */}
          <section className="mt-10 wardrobe-mat rounded-lg p-4 flex items-start gap-3">
            <Icon name="card" size={18} className="text-accent shrink-0 mt-0.5" />
            <div className="text-sm">
              <h2 className="font-display font-bold text-ink mb-1">
                Selling? List to other collectors.
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed max-w-2xl">
                The shop no longer buys cards for store credit — this market is collectors trading with
                collectors. Post an ask with the <span className="text-accent">list yours</span> link on any card,
                or match a standing collector bid; escrow and reputation protect both sides.
                <WhyLink href="/methodology/market" tooltip="How the collectors' market works" label="How the market works" />
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Table view                                                         */
/* ------------------------------------------------------------------ */

function CatalogTable({
  cards,
  game,
}: {
  cards: CatalogCard[];
  game: string;
}) {
  return (
    <div className="wardrobe-mat overflow-x-auto rounded-lg">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface-elevated border-b border-border-subtle text-ink-muted text-xs uppercase tracking-wider">
            <th className="px-3 py-2.5 text-left">Card</th>
            {/* Set + Activity fold away below sm: eight columns of
                whitespace-nowrap sideways-scroll on a phone; the card page
                (a whole-row tap) carries both details. */}
            <th className="px-3 py-2.5 text-left hidden sm:table-cell">Set</th>
            <th className="px-3 py-2.5 text-right text-ask">Best Ask</th>
            <th className="px-3 py-2.5 text-right text-bid">Best Bid</th>
            <th className="px-3 py-2.5 text-center hidden sm:table-cell">Activity</th>
            <th className="px-3 py-2.5 text-right" aria-label="Actions" />
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {cards.map((card) => {
            // Pure collector counts — no house bid to subtract anymore.
            const collectorBids = card.p2p_buyers;
            return (
              <tr
                key={card.sku}
                onClick={() => (window.location.href = `/market/${card.sku}`)}
                className="bg-surface hover:bg-surface-subtle transition cursor-pointer"
              >
                <td className="px-3 py-2">
                  <span className="flex items-center gap-3 min-w-0">
                    <CardThumb card={card} />
                    <span className="min-w-0">
                      <span className="block text-ink font-medium truncate max-w-[220px]">{card.sku}</span>
                      <span className="flex items-center gap-1.5 text-[11px] text-ink-faint font-mono">
                        {card.card_number}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="px-3 py-2 text-ink-muted font-mono text-xs whitespace-nowrap hidden sm:table-cell" title={card.set_name ?? undefined}>
                  {card.set_code}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {card.best_ask != null ? (
                    <span className="text-ask font-semibold font-mono tabular-nums"><Money value={card.best_ask} /></span>
                  ) : (
                    <Link
                      href={listUrl(game, card.sku)}
                      onClick={(e) => e.stopPropagation()}
                      className="text-xs text-accent hover:text-accent-strong underline decoration-dotted underline-offset-2"
                      title="No asks yet — yours would be the first"
                    >
                      list yours
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {card.best_bid != null ? (
                    <span className="text-bid font-semibold font-mono tabular-nums"><Money value={card.best_bid} /></span>
                  ) : (
                    <span className="text-ink-faint text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center whitespace-nowrap hidden sm:table-cell">
                  {card.p2p_sellers > 0 || collectorBids > 0 ? (
                    <span className="text-xs font-mono tabular-nums">
                      {card.p2p_sellers > 0 && (
                        <span className="text-ask">{card.p2p_sellers}s</span>
                      )}
                      {card.p2p_sellers > 0 && collectorBids > 0 && <span className="text-ink-faint"> · </span>}
                      {collectorBids > 0 && <span className="text-bid">{collectorBids}b</span>}
                    </span>
                  ) : (
                    <span className="text-ink-faint text-xs">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Link
                    href={`/market/${card.sku}`}
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center justify-center min-h-[44px] sm:min-h-0 px-3 py-1 text-xs font-bold bg-accent text-page rounded hover:bg-accent-strong transition"
                  >
                    View
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Grid view                                                          */
/* ------------------------------------------------------------------ */

function CatalogGrid({
  cards,
  game,
}: {
  cards: CatalogCard[];
  game: string;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
      {cards.map((card) => {
        // Pure collector counts — no house bid to subtract anymore.
        const collectorBids = card.p2p_buyers;
        return (
          <Link key={card.sku} href={`/market/${card.sku}`} className="wardrobe-panel p-3 hover:bg-surface-subtle transition group">
            <div className="aspect-[2.5/3.5] w-full bg-surface-subtle border border-border-subtle rounded-lg mb-3 flex items-center justify-center p-3 text-center">
              <span className="text-ink-faint text-xs">Upstream image withheld</span>
            </div>

            <h3 className="text-sm font-semibold text-ink truncate">{card.sku}</h3>
            <p className="text-xs text-ink-faint font-mono mb-2 truncate">
              {card.card_number} · {card.set_code}
            </p>

            <div className="flex items-baseline justify-between gap-2">
              {card.best_ask != null ? (
                <span className="text-sm font-bold text-ask font-mono tabular-nums"><Money value={card.best_ask} /></span>
              ) : (
                <button
                  className="text-xs text-accent underline decoration-dotted underline-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.location.href = listUrl(game, card.sku);
                  }}
                  title="No asks yet — yours would be the first"
                >
                  list yours
                </button>
              )}
              {card.best_bid != null && (
                <span className="text-xs text-bid font-mono tabular-nums">bid <Money value={card.best_bid} /></span>
              )}
            </div>

            <p className="text-[10px] text-ink-faint font-mono tabular-nums mt-1">
              {(card.p2p_sellers > 0 || collectorBids > 0) && (
                <>
                  {card.p2p_sellers > 0 && <span className="text-ask">{card.p2p_sellers} seller{card.p2p_sellers !== 1 ? "s" : ""}</span>}
                  {card.p2p_sellers > 0 && collectorBids > 0 && " · "}
                  {collectorBids > 0 && <span className="text-bid">{collectorBids} buyer{collectorBids !== 1 ? "s" : ""}</span>}
                </>
              )}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

function CardThumb({ card }: { card: CatalogCard }) {
  return (
    <span className="w-10 h-14 bg-surface-subtle border border-border-subtle rounded flex items-center justify-center shrink-0">
      <span className="text-ink-faint text-[8px]" title={card.sku}>SKU</span>
    </span>
  );
}

function SetButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-left text-sm px-3 py-2 rounded-lg transition flex justify-between items-center ${
        active ? "bg-accent-wash text-accent font-semibold" : "text-ink-muted hover:bg-surface-subtle hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function SetPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 text-xs px-3 py-1.5 rounded-full transition whitespace-nowrap ${
        active ? "bg-accent text-page font-bold" : "bg-surface border border-border-subtle text-ink-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function CatalogSkeleton({ view, caption }: { view: ViewMode; caption?: string }) {
  if (view === "grid") {
    return (
      <div aria-busy="true" aria-live="polite">
        {caption && (
          <p className="font-display italic text-sm text-ink-faint mb-3">{caption}</p>
        )}
        <span className="sr-only">Loading cards…</span>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="wardrobe-mat rounded-lg p-3 animate-pulse">
              <div className="aspect-[2.5/3.5] bg-surface-subtle rounded-lg mb-3" />
              <div className="h-4 bg-surface-subtle rounded w-3/4 mb-2" />
              <div className="h-3 bg-surface-subtle rounded w-1/2 mb-3" />
              <div className="h-4 bg-surface-subtle rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div aria-busy="true" aria-live="polite">
      {caption && (
        <p className="font-display italic text-sm text-ink-faint mb-3">{caption}</p>
      )}
      <span className="sr-only">Loading cards…</span>
      <div className="wardrobe-mat overflow-x-auto rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-elevated border-b border-border-subtle text-ink-muted text-xs uppercase tracking-wider">
              <th className="px-3 py-2.5 text-left">Card</th>
              <th className="px-3 py-2.5 text-left hidden sm:table-cell">Set</th>
              <th className="px-3 py-2.5 text-right">Best Ask</th>
              <th className="px-3 py-2.5 text-right">Best Bid</th>
              <th className="px-3 py-2.5 text-center hidden sm:table-cell">Activity</th>
              <th className="px-3 py-2.5 text-right">Spot</th>
              <th className="px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 12 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                <td className="px-3 py-3"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3 hidden sm:table-cell"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3 hidden sm:table-cell"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
                <td className="px-3 py-3"><div className="h-4 bg-surface-subtle rounded w-full" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
