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
import { SHARE_CARD } from "@/lib/share-card";

export const metadata: Metadata = {
  title: "Card prices — Cambridge TCG",
  description:
    "Find cards by game and card number. Sign in with your existing account for available source prices and history.",
  openGraph: {
    title: "Card prices — Cambridge TCG",
    description:
      "Find a card, browse its set and check available source prices.",
    images: [SHARE_CARD],
  },
};

// Curated game pages remain distinct from catalog records currently returned.
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


/** Compact browse links keep catalog availability visible without repeating
 * source-host registration details on every game. */
function GameLinks({ tiles }: { tiles: ResolvedTile[] }) {
  return (
    <ul className="grid gap-x-8 sm:grid-cols-2">
      {tiles.map(({ config, live }) => {
        const cardCount = live?.card_count ?? 0;
        return (
          <li key={config.slug} className="border-b border-border-subtle">
            <Link
              href={`/prices/${config.slug}`}
              className="flex min-h-14 items-center justify-between gap-4 py-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <span className="font-medium text-ink">{config.display_name}</span>
              <span className="text-right text-sm text-ink-muted">
                {cardCount > 0
                  ? `${cardCount.toLocaleString()} catalog records`
                  : live && cardCount === 0 ? "No records returned" : "Records unavailable"}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
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
  const otherTiles = tiles.filter((t) => (t.live?.card_count ?? 0) <= 0);

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
        name: "Card prices",
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
        <div lang="en">
        <PageHeader
          title="Card prices"
          description="Find a card and check available source prices."
        />

        <Section id="card-price-search" title="Find a card">
          <Card className="sm:p-6">
            <CardPriceSearchForm games={liveGames} browseHref="#browse-by-game" />
          </Card>
        </Section>

        <MemberPriceBrowser search={search} />

        <Section
          id="browse-by-game"
          title="Browse by game"
          action={<Link href="/prices/coverage" className="text-sm text-accent hover:underline">Source coverage</Link>}
          className="mt-8 scroll-mt-24"
        >
          <div className="mb-3 text-sm text-ink-muted">
            <Provenance
              kind={liveGames.length > 0 ? "synced" : "unavailable"}
              source="wholesale catalog"
            />
          </div>
          {observedTiles.length > 0 ? (
            <GameLinks tiles={observedTiles} />
          ) : (
            <p className="text-sm leading-6 text-ink-muted">
              {liveGames.length > 0
                ? "No card records are listed for these game guides."
                : "Catalog records are unavailable right now. Check source coverage for recorded status."}
            </p>
          )}
          {otherTiles.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer py-2 text-sm font-medium text-ink">
                Other games and coverage
              </summary>
              <GameLinks tiles={otherTiles} />
            </details>
          )}
        </Section>

        <details className="mt-8 border-t border-border-subtle pt-5">
          <summary className="cursor-pointer py-1 text-base font-semibold text-ink">About these prices</summary>
          <div className="mt-3 max-w-3xl space-y-3 text-sm leading-6 text-ink-muted">
            <p>Reference data, not an offer. A missing price is not zero.</p>
            <p>
              Some prices and images remain withheld because their source permissions
              are unverified. Signing in or converting a price does not change those permissions.
            </p>
            <p>
              The stored observation archive is legacy CardRush data whose acquisition is
              disabled by source policy, so it does not refresh; the{" "}
              <Link href="/prices/coverage" className="text-accent hover:underline">coverage map</Link>{" "}
              shows its latest stored snapshot. Member prices are manual imports; each row
              shows its source and retrieval times.
            </p>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              <WhyLink href="/methodology/pricing" label="How prices work" />
              <Link href="/methodology/cross-source-pricing" className="text-accent hover:underline">Comparing sources</Link>
              <Link href="/methodology/upstream-sources" className="text-accent hover:underline">Source permissions</Link>
            </div>
          </div>
        </details>

        <details className="mt-6 border-t border-border-subtle pt-5">
          <summary className="cursor-pointer py-1 text-base font-semibold text-ink">Currency tools</summary>
          <p className="mt-3 mb-4 max-w-2xl text-sm leading-6 text-ink-muted">
            Member prices keep their original currency. These exchange-rate tools do not convert the observations above.
          </p>
          <div className="mb-4"><CurrencyWhyLink /></div>
          <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
            <CurrencySelector selected={currency} rates={rates} back="/prices" />
            <RateTablePanel rates={rates} selected={currency} />
          </div>
        </details>
        </div>
      </PageLayout>
    </>
  );
}
