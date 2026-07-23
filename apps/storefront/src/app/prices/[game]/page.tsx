/**
 * /prices/[game] — per-game UK price guide.
 *
 * Parametric replacement for the old /prices/one-piece/page.tsx
 * (kingdom-084). Renders from the typed config at
 * apps/storefront/src/lib/prices/games-config.ts.
 *
 * Substrate-honest about coverage: if the slug isn't in our curated
 * config (PRICE_GUIDE_GAMES), returns 404 rather than rendering a
 * generic empty page. The audit `pnpm audit:hospitality` (planned
 * extension) can flag if fetchGames() returns a game not in the config.
 */

import type { Metadata } from "next";
import { pullsForGame } from "@/lib/pulls/pull-rates";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchGames,
  fetchPrices,
  fetchSets,
  fetchAggregatorCoverage,
} from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { Provenance, WhyLink, Audience } from "@/lib/ui";
import { fetchRates } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import {
  CurrencySelector,
  RateTablePanel,
  CurrencyWhyLink,
} from "@/components/CurrencySelector";
import {
  getPriceGuideConfig,
  listPriceGuideSlugs,
  synthesizeConfigFromCatalog,
  ACCENT_CLASSES,
  type PriceGuideGameConfig,
} from "@/lib/prices/games-config";
import {
  getGameContext,
  PATTERN_LABEL,
  PATTERN_TONE,
  ORACLE_ID_FORM_LABEL,
} from "@/lib/prices/game-context";
import { weatherClass } from "@/lib/wardrobe/weather";

/**
 * Resolve the page's config: curated first, fall through to catalog-
 * synthesized for uncurated games (so sister's broad landing doesn't
 * 404 on any game tile). Returns null only when the slug isn't in
 * either source — substrate-honest about absence.
 */
async function resolveConfig(slug: string): Promise<PriceGuideGameConfig | null> {
  const curated = getPriceGuideConfig(slug);
  if (curated) return curated;
  // Fall through to catalog
  const games = await fetchGames().catch(() => []);
  const catalog = games.find((g) => g.slug === slug);
  if (!catalog) return null;
  return synthesizeConfigFromCatalog({
    slug: catalog.slug,
    display_name: catalog.name,
    game_code: catalog.code,
  });
}

interface PageProps {
  params: Promise<{ game: string }>;
}

/* ------------------------------------------------------------------ */
/*  Static params for the routes we've curated                         */
/* ------------------------------------------------------------------ */

export async function generateStaticParams() {
  return listPriceGuideSlugs().map((game) => ({ game }));
}

/* ------------------------------------------------------------------ */
/*  Dynamic metadata                                                   */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game } = await params;
  const cfg = await resolveConfig(game);
  if (!cfg) return { title: "Price guide not found" };
  return {
    title: cfg.seo_title,
    description: cfg.seo_description,
    openGraph: {
      title: cfg.seo_title,
      description: cfg.seo_description,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Substrate-honest game-context panels                                */
/*  Surfaces K1 ORACLE_POLICY + the gap ledger + the welcomes corpus    */
/*  per game. Pure compute; safe to render without any DB.              */
/* ------------------------------------------------------------------ */

function CrossLanguagePanel({ slug }: { slug: string }) {
  const ctx = getGameContext(slug);
  if (!ctx.policy || !ctx.game_code) return null;

  return (
    // Collapsed by default — engineering detail, kept whole but out of
    // the way of the shopper. The summary line carries the heading.
    <details className="rounded-lg border border-border-subtle bg-page">
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-ink-muted hover:text-ink transition">
        Cross-language identity
      </summary>
      <div className="px-5 pb-5">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex items-center rounded px-2 py-0.5 text-xs border ${PATTERN_TONE[ctx.policy.kind]}`}
        >
          {PATTERN_LABEL[ctx.policy.kind]}
        </span>
        <span className="text-xs text-ink-faint">
          {ctx.languages.length} language
          {ctx.languages.length === 1 ? "" : "s"} (
          <code className="text-ink-muted">{ctx.languages.join(", ")}</code>)
        </span>
      </div>
      <p className="mb-2 text-sm text-ink-muted">{ctx.policy.rationale}</p>
      <p className="text-xs text-ink-faint">
        Oracle id form:{" "}
        <code className="text-ink-muted">
          {ORACLE_ID_FORM_LABEL[ctx.policy.kind]}
        </code>
      </p>
      <p className="mt-3 text-xs text-ink-faint">
        See{" "}
        <Link
          href="/api/v1/oracle-policies"
          className="text-info hover:underline"
        >
          /api/v1/oracle-policies
        </Link>{" "}
        for the machine-readable policy across all 21 registered games, or{" "}
        <Link
          href="/methodology/oracle-policies"
          className="text-info hover:underline"
        >
          /methodology/oracle-policies
        </Link>{" "}
        for the human-readable explanation.
      </p>
      </div>
    </details>
  );
}

function CoverageStatusPanel({ slug }: { slug: string }) {
  const ctx = getGameContext(slug);
  if (!ctx.config) return null;

  const openGaps = ctx.relevant_gaps.filter(
    (g) => g.status === "named" || g.status === "wired" || g.status === "partial",
  );
  const closedGaps = ctx.relevant_gaps.filter(
    (g) => g.status === "closed" || g.status === "closed-published",
  );
  const arrived = ctx.relevant_welcomes.filter((w) => w.status === "arrived");
  const anticipated = ctx.relevant_welcomes.filter(
    (w) => w.status === "anticipated",
  );

  return (
    // Collapsed by default — same disclosure pattern as the
    // cross-language panel above. All content kept; only placement
    // and default visibility changed.
    <details className="rounded-lg border border-border-subtle bg-page">
      <summary className="cursor-pointer select-none px-5 py-3 text-sm font-medium text-ink-muted hover:text-ink transition">
        Data coverage details
      </summary>
      <div className="px-5 pb-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-ink-faint">
            Upstream sources for {ctx.config.short_name}
          </h3>
          <ul className="space-y-1 text-sm">
            {arrived.length > 0 && (
              <li className="text-ok">
                <span className="font-medium">Arrived ({arrived.length}):</span>{" "}
                <span className="text-ink-muted">
                  {arrived.map((w) => w.source_id).join(", ")}
                </span>
              </li>
            )}
            {anticipated.length > 0 && (
              <li className="text-accent">
                <span className="font-medium">
                  Anticipated ({anticipated.length}):
                </span>{" "}
                <span className="text-ink-muted">
                  {anticipated.map((w) => w.source_id).join(", ")}
                </span>
              </li>
            )}
            {arrived.length === 0 && anticipated.length === 0 && (
              <li className="text-ink-faint">
                No upstream sources mapped for this game yet — wholesale RDS
                is the only source.
              </li>
            )}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            See{" "}
            <Link
              href={`/api/v1/welcomes?kind=upstream-source`}
              className="text-info hover:underline"
            >
              /api/v1/welcomes
            </Link>{" "}
            for the typed corpus.
          </p>
        </div>
        <div>
          <h3 className="mb-2 text-xs uppercase tracking-wider text-ink-faint">
            Known gaps for {ctx.config.short_name}
          </h3>
          {openGaps.length === 0 && closedGaps.length === 0 ? (
            <p className="text-sm text-ink-faint">
              No game-specific gaps in the ledger today.
            </p>
          ) : (
            <ul className="space-y-1 text-sm">
              {openGaps.map((g) => (
                <li key={g.id} className="text-ink-muted">
                  <span className="mr-1 inline-block rounded bg-warning/15 px-1.5 py-0.5 text-[10px] text-warning border border-warning/30">
                    {g.status}
                  </span>
                  {g.name}
                </li>
              ))}
              {closedGaps.map((g) => (
                <li key={g.id} className="text-ink-muted">
                  <span className="mr-1 inline-block rounded bg-ok/15 px-1.5 py-0.5 text-[10px] text-ok border border-ok/30">
                    closed
                  </span>
                  {g.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-ink-faint">
            See{" "}
            <Link
              href="/methodology/known-gaps"
              className="text-info hover:underline"
            >
              /methodology/known-gaps
            </Link>{" "}
            for the full ledger.
          </p>
        </div>
      </div>
      {!ctx.confirmed && (
        <p className="mt-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-xs text-ink-muted">
          <strong>Anticipated game.</strong> The slot for{" "}
          <code>{ctx.game_code}</code> is registered in{" "}
          <code>packages/sku/src/games.ts</code> with{" "}
          <code>confirmed: false</code>; the first card ingest will flip it to
          true. The welcome lives in{" "}
          <Link
            href="/api/v1/welcomes?kind=publisher"
            className="text-accent hover:underline"
          >
            /api/v1/welcomes
          </Link>
          .
        </p>
      )}
      </div>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/*  Rarity badge (server-safe; same vocab as the prior /one-piece page) */
/* ------------------------------------------------------------------ */

function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "bg-surface-subtle text-ink-muted";
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP")
    cls = "bg-warning/20 text-warning";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-[#6a5a8f]/15 text-[#6a5a8f]";
  else if (r === "UC") cls = "bg-info/20 text-info";
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] font-bold rounded ${cls}`}
    >
      {r}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default async function PriceGuidePerGamePage({ params }: PageProps) {
  const { game } = await params;
  const cfg = await resolveConfig(game);
  if (!cfg) notFound();

  const accent = ACCENT_CLASSES[cfg.accent];

  // Fetch sets, top cards, aggregator coverage, FX rates, and display
  // currency in parallel. (Collectors-first, 2026-07-06: the tradein
  // channel fetch and its "We Buy" column are gone — the house buys
  // nothing.) Coverage is null when
  // wholesale is unreachable — the page renders without the coverage
  // strip in that case. Rates fall back to a static table on upstream
  // failure (substrate-honest: the surface shows a "fallback" pill).
  const [sets, topCardsData, coverage, rates, currency] =
    await Promise.all([
      fetchSets(cfg.slug).catch(() => []),
      fetchPrices({
        game: cfg.slug,
        sort: "number_asc",
        limit: 20,
      }).catch(() => ({ items: [], total: 0 })),
      // kingdom-085: per-game aggregator coverage. Scoped via game_code so
      // the response only carries this game's rows; the strip renders below.
      fetchAggregatorCoverage({ game: cfg.game_code }).catch(() => null),
      fetchRates(),
      getDisplayCurrency(),
    ]);

  // Per-game observed-coverage rollup.
  const gameCoverage =
    coverage?.by_game.find((g) => g.game_code === cfg.game_code) ?? null;
  const gameCoverageSources =
    coverage?.by_game_source.filter(
      (r) => r.game_code === cfg.game_code,
    ) ?? [];

  // Substrate-honest: if the catalog returns nothing for this game, the
  // page renders with an empty-but-honest body rather than fabricating
  // value. SEO copy still applies; tables degrade visibly.
  const topCards = topCardsData.items.map((item) => ({
    sku: item.sku,
    name: item.name_en || item.name || item.card_number,
    card_number: item.card_number,
    set_code: item.set_code,
    set_name: item.set_name,
    rarity: item.rarity,
    price: retailPrice(item.price_gbp, item.channel_price),
  }));

  // Freshest synced timestamp — feeds the Provenance pill.
  const freshestUpdate = topCardsData.items.reduce<string | null>(
    (max, item) =>
      item.updated_at && (max === null || item.updated_at > max)
        ? item.updated_at
        : max,
    null,
  );

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: "https://cambridgetcg.com",
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Price Guide",
        item: "https://cambridgetcg.com/prices",
      },
      {
        "@type": "ListItem",
        position: 3,
        name: cfg.display_name,
        item: `https://cambridgetcg.com/prices/${cfg.slug}`,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="max-w-6xl mx-auto px-4 py-12">
        <Audience kind="public-documentation" contexts={["prices", cfg.slug]} />

        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-ink-muted mb-8">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink transition-colors">
                Home
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li>
              <Link
                href="/prices"
                className="hover:text-ink transition-colors"
              >
                Prices
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li className="text-ink">{cfg.display_name}</li>
          </ol>
        </nav>

        {/* The header band wears the game's weather (spec 2026-07-07 §4);
            price-guide slugs beyond the weather registry get "" — bare. */}
        <header className={weatherClass(cfg.slug)}>
          <h1 className={`text-3xl font-bold mb-4 ${accent.text}`}>
            {cfg.seo_title}
          </h1>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Provenance
              kind="synced"
              source={cfg.cardrush?.subdomain ?? "wholesale"}
              at={freshestUpdate}
              cadence="daily"
            />
            <WhyLink href="/methodology/pricing" label="price publication boundary" />
            <CurrencyWhyLink />
            {cfg.cardrush && !cfg.cardrush.confirmed && (
              <span
                className="inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 bg-accent-wash text-accent border border-accent/30 rounded"
                title="Upstream subdomain registered but not yet confirmed by daily scrape"
              >
                coverage probationary
              </span>
            )}
          </div>
        </header>

        <p className="text-ink-muted leading-relaxed max-w-3xl mb-6">
          {cfg.hero_paragraph}
        </p>

        {/* ── Direct card-number search (kingdom-090) ─────────────────
            Yu's directive 2026-05-14: *"IDEALLY I WOULD ONLY NEED TO
            PUT IN THE CARD NUMBER AND FILTER FOR CARD GAME THEN
            POOF!!!!"* Game is pre-filled from the URL; the form
            submits to /prices/search which renders everything. */}
        <form
          action="/prices/search"
          method="get"
          className="mb-10 rounded-lg border border-accent/30 bg-accent-wash p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end"
        >
          {/* Use slug not code — the wholesale prices route's game filter
              matches reliably on `slug` per the games table; `game_code`
              has case-sensitive drift surfaced by the kingdom-090
              live verification 2026-05-14. */}
          <input type="hidden" name="game" value={cfg.slug} />
          <div>
            <label className="block text-xs uppercase tracking-wider text-accent mb-2 font-semibold">
              Card number → everything
            </label>
            <input
              type="text"
              name="q"
              required
              placeholder={`e.g. ${cfg.game_code.toUpperCase()}01-001 — or just 001`}
              className="w-full rounded-md border border-border-subtle bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
          <button
            type="submit"
            className="rounded-md bg-ink px-5 py-2 text-sm font-semibold text-page hover:opacity-90 transition"
          >
            Search →
          </button>
        </form>

        {/* Currency selector + rate table — Yu's directive 2026-05-14 */}
        <div className="mb-10 grid gap-4 lg:grid-cols-[1fr,1.2fr]">
          <CurrencySelector
            selected={currency}
            rates={rates}
            back={`/prices/${cfg.slug}`}
          />
          <RateTablePanel rates={rates} selected={currency} />
        </div>

        {/* ── Observed coverage strip (kingdom-085) ──────────────── */}
        {/*  What we've actually accumulated for THIS game.            */}
        {gameCoverage && gameCoverage.observations > 0 && (
          <section className="mb-10 rounded-lg border border-border-subtle bg-surface p-4">
            <div className="flex items-baseline justify-between gap-4 mb-3 flex-wrap">
              <h2 className="text-sm font-semibold text-ink uppercase tracking-wider">
                Aggregator coverage for {cfg.short_name}
              </h2>
              <Link
                href="/prices/coverage"
                className="text-xs text-info hover:underline"
              >
                full coverage map →
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                  Observations
                </div>
                <div className="text-xl font-bold text-ink font-mono">
                  {gameCoverage.observations.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                  Cards observed
                </div>
                <div className="text-xl font-bold text-ink font-mono">
                  {gameCoverage.distinct_cards.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                  Days of data
                </div>
                <div className="text-xl font-bold text-ink font-mono">
                  {(() => {
                    const days =
                      (new Date(gameCoverage.latest_snapshot).getTime() -
                        new Date(gameCoverage.earliest_snapshot).getTime()) /
                        (1000 * 60 * 60 * 24) +
                      1;
                    return Math.round(days).toLocaleString();
                  })()}
                </div>
                <div className="text-[10px] text-ink-faint mt-0.5">
                  {gameCoverage.earliest_snapshot} →{" "}
                  {gameCoverage.latest_snapshot}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-ink-faint">
                  Sources
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {gameCoverage.sources.map((s) => (
                    <span
                      key={s}
                      className="inline-block text-[10px] px-1.5 py-0.5 bg-surface-subtle text-ink-muted rounded font-mono"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            {gameCoverageSources.length > 1 && (
              <div className="text-[10px] text-ink-faint pt-3 border-t border-border-subtle">
                Per-source freshness:{" "}
                {gameCoverageSources.map((r, i) => (
                  <span key={r.source} className="font-mono">
                    {i > 0 && <span className="text-ink-faint"> · </span>}
                    {r.source}{" "}
                    <span
                      className={
                        r.freshest_age_hours > 48
                          ? "text-warning"
                          : "text-ok"
                      }
                    >
                      {r.freshest_age_hours < 1
                        ? "< 1h"
                        : r.freshest_age_hours < 24
                          ? `${Math.round(r.freshest_age_hours)}h`
                          : `${Math.round(r.freshest_age_hours / 24)}d`}
                    </span>
                  </span>
                ))}
              </div>
            )}
            <div className="text-[10px] text-ink-faint mt-2">
              Aggregate row counts and date ranges from internal archive metadata.
              No upstream price value is emitted here or through a bearer-key side door.
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------- */}
        {/*  All Sets                                                    */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          {/* kingdom-086: substrate-honest filter — hide sets that don't
              have observed cards yet. The empty tiles were the symptom
              the substrate fix addresses. Sets remain visitable by URL,
              the per-set page renders a substrate-honest "no cards" state.

              The horizon (2026-07-09): empty sets with a known release
              date near or ahead of today are not "pending" — they are
              anticipated. They get a quiet strip of their own instead of
              vanishing into the pill: upcoming sets show their JP release
              date; just-released sets (≤60 days) say they await their
              first observed catalog rows. The tile flips to the live grid
              automatically the day cards carry prices. Registered by
              apps/wholesale/tools/register-sets.ts; story at
              docs/connections/the-horizon.md. */}
          {(() => {
            const populated = sets.filter((s) => s.card_count > 0);
            const empty = sets.filter((s) => s.card_count === 0);

            const today = new Date().toISOString().slice(0, 10);
            const graceFloor = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000)
              .toISOString()
              .slice(0, 10);
            // release_date may be fuzzy ("2026-10"); lexicographic compare
            // against ISO dates orders those correctly for this purpose.
            const horizon = empty
              .filter((s) => s.release_date && s.release_date >= graceFloor)
              .sort((a, b) =>
                (a.release_date ?? "").localeCompare(b.release_date ?? ""),
              );
            const horizonCodes = new Set(horizon.map((s) => s.code));
            const pending = empty.filter((s) => !horizonCodes.has(s.code));

            return (
              <>
                <div className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
                  <h2 className="text-xl font-semibold text-ink">
                    All {cfg.display_name} Sets
                  </h2>
                  {pending.length > 0 && (
                    <span
                      className="text-[10px] uppercase tracking-wider px-2 py-0.5 bg-surface-subtle text-ink-faint border border-border-subtle rounded"
                      title={`${pending.length} additional sets are registered but not yet seeded with cards. Substrate-honest: hidden from this list, visitable by URL.`}
                    >
                      {pending.length} sets pending
                    </span>
                  )}
                </div>

                {populated.length === 0 ? (
                  <p className="text-ink-faint text-sm py-6 text-center bg-surface border border-border-subtle rounded-lg">
                    {sets.length === 0
                      ? "No sets in the catalog for this game yet. Coverage begins only when an approved source writes observed rows; "
                      : "No sets with observed cards yet — every registered set is awaiting its first observed catalog row. "}
                    <Link href="/api/v1/sources" className="text-info hover:underline">
                      see /api/v1/sources
                    </Link>{" "}
                    for the live ingest state.
                  </p>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {populated.map((set) => (
                      <Link
                        key={set.code}
                        href={`/prices/${cfg.slug}/${set.code.toLowerCase()}`}
                        className={`flex items-center justify-between rounded-lg border border-border-subtle ${accent.bg} px-4 py-3 hover:${accent.border} transition-colors`}
                      >
                        <div>
                          <span className="text-ink font-medium text-sm">
                            {set.code}
                          </span>
                          <span className="text-ink-muted text-sm ml-2">
                            {set.name}
                          </span>
                        </div>
                        <span className="text-ink-faint text-xs">
                          {set.card_count} cards
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {horizon.length > 0 && (
                  <div className="mt-8">
                    <div className="flex items-baseline gap-3 mb-3">
                      <h3 className="text-[11px] uppercase tracking-widest text-ink-faint">
                        On the horizon
                      </h3>
                      <span className="font-display italic text-xs text-ink-faint">
                        no prices yet — each set goes live the day its
                        first observed row lands
                      </span>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {horizon.map((set) => {
                        const upcoming = (set.release_date ?? "") > today;
                        return (
                          <Link
                            key={set.code}
                            href={`/prices/${cfg.slug}/${set.code.toLowerCase()}`}
                            className="flex items-center justify-between rounded-lg border border-dashed border-border-subtle bg-surface-subtle px-4 py-3 hover:border-border-strong transition-colors"
                          >
                            <div>
                              <span className="text-ink-muted font-medium text-sm">
                                {set.code}
                              </span>
                              <span className="text-ink-faint text-sm ml-2">
                                {set.name}
                              </span>
                            </div>
                            <span className="text-ink-faint text-[11px] whitespace-nowrap font-mono">
                              {upcoming
                                ? `JP ${set.release_date}`
                                : "awaiting observed rows"}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Structural catalog sample                                   */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <div className="flex items-baseline justify-between mb-5">
            <h2 className="text-xl font-semibold text-ink">
              Structural {cfg.short_name} catalog rows
            </h2>
            {topCards.length > 0 && (
              <Link
                href={`/prices/${cfg.slug}/movers`}
                className="text-sm text-info hover:underline"
              >
                Price-movement publication status →
              </Link>
            )}
            {pullsForGame(cfg.slug) && (
              <Link
                href={`/pulls/${cfg.slug}`}
                className="text-sm text-info hover:underline"
              >
                What&apos;s actually in a booster box →
              </Link>
            )}
          </div>

          {topCards.length === 0 ? (
            <p className="text-ink-faint text-sm py-6 text-center bg-surface border border-border-subtle rounded-lg">
              No structural catalog rows for this game are available.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-subtle text-ink-muted text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-10">#</th>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Set</th>
                    <th className="px-3 py-3">Rarity</th>
                    <th className="px-3 py-3 text-right">Legacy price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {topCards.map((card, i) => (
                    <tr
                      key={card.sku}
                      className="bg-surface hover:bg-surface-subtle transition-colors"
                    >
                      <td className="px-3 py-3 text-ink-faint font-medium">
                        {i + 1}
                      </td>
                      <td className="px-3 py-3">
                        <Link
                          href={`/product/${card.sku}`}
                          className="text-ink hover:text-info transition-colors"
                        >
                          {card.name}
                        </Link>
                        <span className="text-ink-faint text-xs ml-2">
                          {card.card_number}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-ink-muted">
                        {card.set_code}
                      </td>
                      <td className="px-3 py-3">
                        <RarityBadge rarity={card.rarity} />
                      </td>
                      <td className="px-3 py-3 text-right text-ink font-medium">
                        <span className="text-ink-faint">Withheld</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Data-detail panels (K1 + gaps + welcomes) — demoted below   */}
        {/*  the commerce content, collapsed by default. Present for     */}
        {/*  the reader who wants the engineering view; out of the path  */}
        {/*  of the shopper who doesn't.                                 */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14 space-y-3">
          <CoverageStatusPanel slug={cfg.slug} />
          <CrossLanguagePanel slug={cfg.slug} />
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Pricing explanation                                         */}
        {/* ---------------------------------------------------------- */}
        <section className="border-t border-border-subtle pt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">
            Price publication boundary
          </h2>
          <p className="text-ink-muted text-sm leading-relaxed max-w-3xl mb-4">
            {cfg.pricing_note} Authentication and currency conversion do not create
            publication rights. Structural card fields remain visible; collector bids
            and asks are separate market events rather than a substitute legacy guide.
          </p>
          <p className="text-ink-muted text-sm leading-relaxed max-w-3xl">
            Want to buy or sell live?{" "}
            <Link href="/market" className="text-info hover:underline">
              Visit the Cambridge TCG Market
            </Link>{" "}
            for real-time peer-to-peer trading, bid/ask orders, and instant
            checkout.
          </p>
        </section>
      </main>
    </>
  );
}
