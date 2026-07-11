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
 * view stays shareable. Back/forward does NOT re-enter this page (the
 * app router restores the URL without a server re-render); MarketBrowser
 * re-seeds its own state from the URL in a popstate listener, using the
 * same parseBrowseParams this page parses with.
 */

import { Suspense } from "react";
import { cookies } from "next/headers";
import Link from "next/link";
import { Icon, Provenance } from "@/lib/ui";
import { GET as catalogGET } from "@/app/api/market/catalog/route";
import MarketBrowser, { CatalogSkeleton } from "@/components/market/MarketBrowser";
import { catalogSourceBadges } from "@/components/market/source-provenance";
import {
  buildCatalogSearch,
  parseBrowseParams,
  parseCatalogError,
  sortSetsForDisplay,
  DEFAULT_GAME,
  type CatalogQuery,
  type CatalogResult,
  type CatalogSource,
  type SetsResult,
} from "@/components/market/catalog";
import type { GameItem } from "@/lib/wholesale/client";

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function MarketPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    const s = first(v);
    if (s !== undefined) sp.set(k, s);
  }
  // Shared with MarketBrowser's popstate handler — the URL must mean the
  // same query on the server pass and on client back/forward.
  const query: CatalogQuery = parseBrowseParams(sp);

  // Text-mode readers (no-JS, screen readers, low bandwidth, agents) get
  // the real table server-rendered synchronously — the streaming skeleton
  // that a JS browser swaps out would otherwise be all they ever see.
  const textMode = (await cookies()).get("text-mode")?.value === "1";

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
            <h1 className="font-display text-3xl font-semibold tracking-tight text-ink mb-2">
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
              <Icon name="trophy" className="text-accent" /> Rankings paused
            </Link>
          </div>
        </div>

        {/* ========== BROWSER (first page server-rendered, streams in) ==========
            In text-mode the Suspense boundary is skipped so the table is in
            the SSR HTML, not a shimmer a no-JS reader can never resolve. */}
        {textMode ? (
          <CatalogSection query={query} />
        ) : (
          <Suspense fallback={<CatalogSkeleton view={query.view} />}>
            <CatalogSection query={query} />
          </Suspense>
        )}
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

/** Games with live catalog coverage, from the same route's view=games.
 *  Optional enrichment: a failure hides the switcher rather than
 *  blocking the browse. */
async function loadGames(): Promise<GameItem[]> {
  try {
    const res = await catalogGET(new Request(`${INTERNAL_BASE}?view=games`));
    if (!res.ok) return [];
    const body = await res.json();
    return (body.games as GameItem[]) ?? [];
  } catch (err) {
    console.error("[market] server games load failed", err);
    return [];
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
  // One parallel trio — no waterfall; the shell above already streamed.
  const [initialCatalog, initialSets, games] = await Promise.all([
    loadCards(query),
    loadSets(query.game),
    loadGames(),
  ]);

  return (
    <>
      {/* Game switcher — catalog-driven tabs (the trade-in TRADEIN_GAMES
          tab pattern). Link navigation, not client state: a game switch
          is a real server navigation so the set sidebar and first page
          reload for the new game via the key remount below. */}
      {games.length > 0 && (
        <nav aria-label="Game" className="flex flex-wrap gap-2 mb-5">
          {games.map((g) => (
            <Link
              key={g.slug}
              href={g.slug === DEFAULT_GAME ? "/market" : `/market?game=${encodeURIComponent(g.slug)}`}
              aria-current={query.game === g.slug ? "page" : undefined}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
                query.game === g.slug
                  ? "bg-ink text-page"
                  : "bg-surface border border-border-subtle text-ink-muted hover:text-ink"
              }`}
            >
              {g.name}
            </Link>
          ))}
        </nav>
      )}
      <MarketBrowser
        // Remount on real server navigations (fresh loads, shared links) so
        // client state re-seeds from the server-fetched data. Back/forward
        // never re-renders this server component — MarketBrowser's popstate
        // listener owns that case.
        key={[query.game, query.q, query.set ?? "", query.sort, query.page, query.view].join("|")}
        initial={query}
        initialCatalog={initialCatalog}
        initialSets={initialSets}
        statsProvenance={<Provenance kind="computed" by="cards on this page" />}
        sourceBadges={catalogSourceBadges()}
      />
    </>
  );
}
