import type { Metadata } from "next";
import Link from "next/link";
import { fetchGames, type GameItem } from "@/lib/wholesale/client";
import { Provenance, WhyLink } from "@/lib/ui";
import {
  PRICE_GUIDE_GAMES,
  ACCENT_CLASSES,
  type PriceGuideGameConfig,
} from "@/lib/prices/games-config";
import { fetchRates } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import {
  CurrencySelector,
  RateTablePanel,
  CurrencyWhyLink,
} from "@/components/CurrencySelector";
import { CardPriceSearchForm } from "@/app/prices/_components/CardPriceSearchForm";

export const metadata: Metadata = {
  title: "TCG Structural Catalog — Price Publication Paused — Cambridge TCG",
  description:
    "Search structural catalog rows across supported games. Legacy price values, images, and historical movements are withheld pending field-level source-rights records.",
  openGraph: {
    title: "TCG Structural Catalog — Price Publication Paused — Cambridge TCG",
    description:
      "Find structural card rows and inspect publication status. Legacy prices, images, and historical movements are not published.",
  },
};

// ── Composition: curated × live ─────────────────────────────────────────
//
// Sister-Sophia's `PRICE_GUIDE_GAMES` (kingdom-084, @/lib/prices/games-config)
// is the curated source-of-truth — per-game SEO copy + accent + cardrush
// attribution. The wholesale catalog's `fetchGames()` is the live signal —
// which games actually have card data we can show.
//
// **The landing renders the INTERSECTION**: games we both have curated
// copy for AND actually carry rows in the catalog. Substrate-honest about
// the gap on either side:
//   - Curated but not in catalog → "preparing coverage" pill
//   - In catalog but not curated → silently hidden (won't 404 on direct
//     access since /prices/[game] handles its own 404; just not surfaced
//     on the landing). The audit:hospitality / audit:welcomes family will
//     surface this gap as a recursion target.

interface ResolvedTile {
  config: PriceGuideGameConfig;
  live: GameItem | null;
}

function composeTiles(games: GameItem[]): ResolvedTile[] {
  const liveBySlug = new Map(games.map((g) => [g.slug, g]));
  return [...PRICE_GUIDE_GAMES]
    .sort((a, b) => a.display_priority - b.display_priority)
    .map((cfg) => ({ config: cfg, live: liveBySlug.get(cfg.slug) ?? null }));
}

// ── Page ───────────────────────────────────────────────────────────────

export default async function PricesLandingPage() {
  const [liveGames, rates, currency] = await Promise.all([
    fetchGames().catch(() => [] as GameItem[]),
    fetchRates(),
    getDisplayCurrency(),
  ]);
  const tiles = composeTiles(liveGames);
  const observedTiles = tiles.filter((t) => (t.live?.card_count ?? 0) > 0);
  const totalCards = observedTiles.reduce(
    (sum, t) => sum + (t.live?.card_count ?? 0),
    0,
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
        name: "Price publication status",
        item: "https://cambridgetcg.com/prices",
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="mx-auto max-w-5xl px-4 py-10 sm:py-12">
        <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-muted">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-ink transition-colors">
                Home
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li className="text-ink">Price Guide</li>
          </ol>
        </nav>

        <header className="max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Structural catalog and source-rights status
          </p>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">
            Find a structural card record
          </h1>
          <p className="mt-4 text-base leading-relaxed text-ink-muted sm:text-lg">
            Search by the number printed on the card to see structural catalog
            fields and source status. This is reference data, not an offer.
            Legacy prices, images, and historical movements are withheld; null
            does not mean zero.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Provenance
              kind={observedTiles.length > 0 ? "synced" : "unavailable"}
              source="wholesale catalog"
            />
              <WhyLink href="/methodology/pricing" label="price publication boundary" />
            <Link
              href="/prices/coverage"
              className="text-xs text-info hover:underline"
            >
              source coverage →
            </Link>
            {totalCards > 0 ? (
              <span className="text-xs text-ink-faint">
                {totalCards.toLocaleString()} observed catalog rows across{" "}
                {observedTiles.length}{" "}
                {observedTiles.length === 1 ? "game" : "games"}
              </span>
            ) : null}
          </div>
        </header>

        <section
          aria-labelledby="card-price-search-heading"
          className="my-8 rounded-xl border border-accent/30 bg-accent-wash p-5 sm:p-6"
        >
          <div className="mb-4">
            <h2
              id="card-price-search-heading"
              className="text-lg font-semibold text-ink"
            >
              Search the structural catalog
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Pick a game, enter the card number, and go straight to the
              matching structural row and current publication status.
            </p>
          </div>
          <CardPriceSearchForm
            games={liveGames}
            autoFocus
            browseHref="#browse-by-game"
          />
        </section>

        <section
          id="browse-by-game"
          aria-labelledby="browse-by-game-heading"
          className="scroll-mt-24"
        >
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2
                id="browse-by-game-heading"
                className="text-xl font-semibold text-ink"
              >
                Browse by game
              </h2>
              <p className="mt-1 text-sm text-ink-muted">
                Don&rsquo;t have the card number? Start with its game and set.
              </p>
            </div>
            <Link
              href="/prices/coverage"
              className="text-sm text-info hover:underline"
            >
              View all source coverage →
            </Link>
          </div>

          {tiles.length === 0 ? (
            <div className="rounded-lg border border-border-subtle bg-surface p-6 text-ink-muted text-sm">
              More games coming soon — see the{" "}
              <Link
                href="/prices/coverage"
                className="text-info hover:underline"
              >
                coverage map
              </Link>{" "}
              for what each source covers today.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tiles.map(({ config, live }) => {
                const accent = ACCENT_CLASSES[config.accent];
                const cardCount = live?.card_count ?? 0;
                const isLive = live !== null && cardCount > 0;
                return (
                  <Link
                    key={config.slug}
                    href={`/prices/${config.slug}`}
                    className={`group block rounded-xl border border-border-subtle ${accent.bg} p-5 transition-colors hover:border-border-strong`}
                  >
                    <div className="mb-4 flex items-start justify-between gap-3">
                      <h3 className={`text-lg font-semibold ${accent.text}`}>
                        {config.display_name}
                      </h3>
                      <span className="text-xs text-ink-faint font-mono">
                        {config.game_code}
                      </span>
                    </div>
                    <div className="flex items-end justify-between gap-3 text-xs">
                      <div className="space-y-2">
                        <p className="text-ink-muted">
                          {isLive
                            ? `${cardCount.toLocaleString()} observed rows`
                            : config.coverage_status === "anticipated"
                              ? "Anticipated · no observed rows"
                              : "Observed source · rows unavailable"}
                        </p>
                        {config.cardrush ? (
                          <span
                            className={`inline-flex rounded border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                              config.cardrush.confirmed
                                ? "border-ok/30 bg-ok/10 text-ok"
                                : "border-border-subtle bg-surface text-ink-faint"
                            }`}
                            title={
                              config.cardrush.confirmed
                                ? `${config.cardrush.subdomain} host verified; observed catalog rows are reported separately`
                                : `${config.cardrush.subdomain} registered but not yet confirmed by ingest`
                            }
                          >
                            {config.cardrush.confirmed
                              ? isLive
                                ? "CardRush source"
                                : "host verified"
                              : "probationary"}
                          </span>
                        ) : null}
                      </div>
                      <span className="font-medium text-info transition-transform group-hover:translate-x-0.5">
                        {isLive ? "Browse cards →" : "View status →"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <div className="mt-14 border-t border-border-subtle pt-8">
          <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Currency tools
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                FX rates remain available as standalone operational data. There
                are no published legacy card-price values to convert today.
              </p>
            </div>
            <CurrencyWhyLink />
          </div>
          <div className="grid gap-4 lg:grid-cols-[1fr,1.2fr]">
            <CurrencySelector
              selected={currency}
              rates={rates}
              back="/prices"
            />
            <RateTablePanel rates={rates} selected={currency} />
          </div>
        </div>

        <section className="mt-14 border-t border-border-subtle pt-8">
          <h2 className="mb-3 text-lg font-semibold text-ink">
            Why price values are absent
          </h2>
          <p className="mb-4 max-w-3xl text-sm leading-relaxed text-ink-muted">
            Stored legacy wholesale prices, channel-derived values, images, and
            historical movements are not published. Their rows predate field-level
            source-rights receipts, and authentication or mathematical transformation
            does not create publication permission.
          </p>
          <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">
            Structural identity and set membership remain browseable. Collector
            bids and asks, when explicitly published by their owners, are separate
            market events and are not substituted for the withheld legacy guide.
            Use the{" "}
            <Link href="/prices/coverage" className="text-info hover:underline">
              coverage map
            </Link>{" "}
            to see what each source covers, read{" "}
            <Link
              href="/methodology/cross-source-pricing"
              className="text-info hover:underline"
            >
              the comparison methodology
            </Link>
            , or inspect source license terms in{" "}
            <Link
              href="/methodology/upstream-sources"
              className="text-info hover:underline"
            >
              the welcome table
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
