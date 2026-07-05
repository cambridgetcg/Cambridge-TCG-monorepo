/**
 * /market — The Collectors' Market.
 *
 * Collector-first front door for peer-to-peer trade: list a card, search
 * the catalog, read the live book. The house buylist (instant store
 * credit) still works from here but is deliberately secondary — one
 * compact card and quiet per-row sell links, not the headline.
 *
 * Server component: the shell renders immediately; the first catalog
 * page + set list stream in through <Suspense>, fetched by calling the
 * catalog route handler in-process (no HTTP hop to ourselves). All later
 * interaction (search-as-you-type, sets, paging) is client-side in
 * <MarketBrowser>, which syncs the URL via history.pushState — so every
 * view stays shareable and back/forward re-enters through this page
 * (the `key` on the browser remounts it with fresh server data).
 */

import { Suspense } from "react";
import Link from "next/link";
import { Icon, Provenance } from "@/lib/ui";
import { GET as catalogGET } from "@/app/api/market/catalog/route";
import MarketBrowser, { CatalogSkeleton } from "@/components/market/MarketBrowser";
import { catalogSourceBadges } from "@/components/market/source-provenance";
import {
  buildCatalogSearch,
  isSortKey,
  parseCatalogError,
  sortSetsForDisplay,
  DEFAULT_GAME,
  type CatalogQuery,
  type CatalogResult,
  type CatalogSource,
  type SetsResult,
  type ViewMode,
} from "@/components/market/catalog";

interface MarketSearchParams {
  game?: string;
  q?: string;
  set?: string;
  sort?: string;
  page?: string;
  view?: string;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const params: MarketSearchParams = {
    game: first(raw.game),
    q: first(raw.q),
    set: first(raw.set),
    sort: first(raw.sort),
    page: first(raw.page),
    view: first(raw.view),
  };

  const query: CatalogQuery = {
    game: (params.game || DEFAULT_GAME).trim() || DEFAULT_GAME,
    q: (params.q || "").trim(),
    set: (params.set || "").trim() || null,
    sort: isSortKey(params.sort) ? params.sort : "name_asc",
    page: Math.max(1, parseInt(params.page || "1", 10) || 1),
    view: (params.view === "grid" ? "grid" : "table") as ViewMode,
  };

  const listHref =
    query.game !== DEFAULT_GAME
      ? `/market/list?game=${encodeURIComponent(query.game)}`
      : "/market/list";

  return (
    <div className="min-h-screen">
      <div className="max-w-[1400px] mx-auto px-4 py-8">
        {/* ========== HEADER — collectors first ========== */}
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-display text-3xl font-black tracking-tight text-ink mb-2">
              The Collectors&rsquo; Market
            </h1>
            <p className="text-ink-muted max-w-2xl">
              Buy and sell directly with other collectors. Every card has its own market
              page — read the book, place a bid, or list a card at your price.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={listHref}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-accent text-page rounded-lg text-sm font-bold hover:bg-accent-strong transition"
            >
              <Icon name="card" /> List a card
            </Link>
            <Link
              href="/market/pulse"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="pulse" className="text-accent" /> Market Pulse
            </Link>
            <Link
              href="/market/lots"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="lots" className="text-accent" /> Lots
            </Link>
            <Link
              href="/leaderboards"
              className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-surface hover:bg-surface-subtle border border-border-subtle rounded-lg text-sm text-ink font-medium transition"
            >
              <Icon name="trophy" className="text-accent" /> Leaderboards
            </Link>
          </div>
        </div>

        {/* ========== BROWSER (first page server-rendered, streams in) ========== */}
        <Suspense fallback={<CatalogSkeleton view={query.view} />}>
          <CatalogSection query={query} />
        </Suspense>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Server-side catalog load — the route handler called in-process     */
/* ------------------------------------------------------------------ */

// Host is a placeholder: the handler only reads the query string.
const INTERNAL_BASE = "http://market.internal/api/market/catalog";

async function loadCards(query: CatalogQuery): Promise<CatalogResult> {
  try {
    const res = await catalogGET(new Request(`${INTERNAL_BASE}?${buildCatalogSearch(query)}`));
    const body = await res.json();
    if (!res.ok) {
      const { message, code } = parseCatalogError(body);
      return { ok: false, message, code };
    }
    return {
      ok: true,
      cards: body.cards ?? [],
      total: body.total ?? 0,
      source: (body.source as CatalogSource) ?? "unavailable",
    };
  } catch (err) {
    console.error("[market] server catalog load failed", err);
    return {
      ok: false,
      message:
        "The card catalog can't be loaded right now — this is a source outage, not an empty catalog. Please try again shortly.",
    };
  }
}

async function loadSets(game: string): Promise<SetsResult> {
  try {
    const res = await catalogGET(
      new Request(`${INTERNAL_BASE}?view=sets&game=${encodeURIComponent(game)}`),
    );
    const body = await res.json();
    if (!res.ok) {
      const { message, code } = parseCatalogError(body);
      return { ok: false, message, code };
    }
    return {
      ok: true,
      sets: sortSetsForDisplay(body.sets ?? []),
      source: (body.source as CatalogSource) ?? "unavailable",
    };
  } catch (err) {
    console.error("[market] server sets load failed", err);
    return { ok: false, message: "Set list unavailable." };
  }
}

async function CatalogSection({ query }: { query: CatalogQuery }) {
  // One parallel pair — no waterfall; the shell above already streamed.
  const [initialCatalog, initialSets] = await Promise.all([
    loadCards(query),
    loadSets(query.game),
  ]);

  return (
    <MarketBrowser
      // Remount on real navigations (back/forward, shared links) so the
      // client state re-seeds from the freshly server-fetched data.
      key={[query.game, query.q, query.set ?? "", query.sort, query.page, query.view].join("|")}
      initial={query}
      initialCatalog={initialCatalog}
      initialSets={initialSets}
      statsProvenance={<Provenance kind="computed" by="cards on this page" />}
      sourceBadges={catalogSourceBadges()}
    />
  );
}
