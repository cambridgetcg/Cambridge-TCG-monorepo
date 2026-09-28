import type { Metadata } from "next";
import Link from "next/link";
import { fetchGames, type GameItem } from "@/lib/wholesale/client";
import { Card, PageHeader, Provenance, WhyLink } from "@/lib/ui";
import { PageLayout } from "@/lib/ui/PageLayout";
import { Section } from "@/lib/ui/Section";
import {
  PRICE_GUIDE_GAMES,
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
import { MemberPriceBrowser } from "@/components/prices/member-browser";
import type { MemberPriceSearchParams } from "@/components/prices/member-query";

export const metadata: Metadata = {
  title: "Price Guide & Free Member Prices — Cambridge TCG",
  description:
    "Browse the public card catalog, or sign in for free to inspect permitted source prices and history. Source-specific download restrictions apply.",
  openGraph: {
    title: "Price Guide & Free Member Prices — Cambridge TCG",
    description:
      "Public card catalog and free member price reference tools, with source attribution and publication boundaries.",
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

export default async function PricesLandingPage({ searchParams }: {
  searchParams: Promise<MemberPriceSearchParams>;
}) {
  const search = await searchParams;
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

      <PageLayout>
        <header className="max-w-3xl">
          <PageHeader
            size="large"
            title="Cards and prices"
            description={
              <>
                Browse public card details, or use your existing account to compare
                permitted source prices. This is reference data, not an offer.
                Prices from different sources can mean different things; a missing price is not zero.
              </>
            }
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Provenance
              kind={observedTiles.length > 0 ? "synced" : "unavailable"}
              source="wholesale catalog"
            />
            <WhyLink href="/methodology/pricing" label="About published prices" />
            <Link
              href="/prices/coverage"
              className="text-sm text-accent hover:underline"
            >
              Source coverage
            </Link>
            {totalCards > 0 ? (
              <span className="text-sm text-ink-muted">
                {totalCards.toLocaleString()} catalog records across{" "}
                {observedTiles.length}{" "}
                {observedTiles.length === 1 ? "game" : "games"}
              </span>
            ) : null}
          </div>
        </header>

        <MemberPriceBrowser search={search} />

        <Section
          id="card-price-search"
          title="Find a card"
          description="Choose a game and enter the number printed on your card. Results include card details, known variants and source status."
          className="my-8"
        >
          <Card className="sm:p-6">
            <CardPriceSearchForm
              games={liveGames}
              browseHref="#browse-by-game"
            />
          </Card>
        </Section>

        <Section
          id="browse-by-game"
          title="Browse by game"
          description="Start with a game and set if you do not have the card number."
          action={<Link href="/prices/coverage" className="text-sm text-accent hover:underline">View source coverage</Link>}
          className="scroll-mt-24"
        >
          {tiles.length === 0 ? (
            <Card padding="lg" className="text-sm text-ink-muted">
              No game records are available to browse. Check the{" "}
              <Link
                href="/prices/coverage"
                className="text-info hover:underline"
              >
                coverage map
              </Link>{" "}
              for each source&rsquo;s recorded status.
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {tiles.map(({ config, live }) => {
                const cardCount = live?.card_count ?? 0;
                const isLive = live !== null && cardCount > 0;
                return (
                  <Link
                    key={config.slug}
                    href={`/prices/${config.slug}`}
                    className="block rounded-lg border border-border-subtle bg-surface p-5 transition-colors hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="text-base font-semibold text-ink">
                        {config.display_name}
                      </h3>
                      <span className="text-sm text-ink-muted font-mono">
                        {config.game_code}
                      </span>
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="space-y-2">
                        <p className="text-ink-muted">
                          {isLive
                            ? `${cardCount.toLocaleString()} catalog records`
                            : config.coverage_status === "anticipated"
                              ? "No catalog records observed"
                              : "Catalog records unavailable"}
                        </p>
                        {config.cardrush ? (
                          <span
                            className="block text-sm text-ink-muted"
                            title={
                              config.cardrush.confirmed
                                ? `${config.cardrush.subdomain} host verified; observed catalog rows are reported separately`
                                : `${config.cardrush.subdomain} registered but not yet confirmed by ingest`
                            }
                          >
                            {config.cardrush.confirmed
                              ? isLive
                                ? "CardRush source host verified"
                                : "Source host verified; records unavailable"
                              : "Source host unconfirmed"}
                          </span>
                        ) : null}
                      </div>
                      <span className="block font-medium text-accent">
                        {isLive ? "Browse cards" : "View source status"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </Section>

        <details className="mt-8 border-t border-border-subtle pt-5">
          <summary className="cursor-pointer text-base font-semibold text-ink">Currency tools</summary>
          <p className="mt-4 mb-4 max-w-2xl text-sm leading-6 text-ink-muted">
            FX rates remain available as standalone operational data. Member
            observations above keep their native currency; these tools do not
            convert or condition-adjust the source prices.
          </p>
          <div className="mb-4"><CurrencyWhyLink /></div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <CurrencySelector
              selected={currency}
              rates={rates}
              back="/prices"
            />
            <RateTablePanel rates={rates} selected={currency} />
          </div>
        </details>

        <details className="mt-6 border-t border-border-subtle pt-5">
          <summary className="cursor-pointer text-base font-semibold text-ink">Why some data is withheld</summary>
          <p className="mt-4 mb-4 max-w-3xl text-sm leading-relaxed text-ink-muted">
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
              source permissions
            </Link>
            .
          </p>
        </details>
      </PageLayout>
    </>
  );
}
