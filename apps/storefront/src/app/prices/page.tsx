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
} from "@/components/CurrencySelector";

export const metadata: Metadata = {
  title: "TCG Card Price Guide UK — Cambridge TCG",
  description:
    "Free, daily-updated price guide covering One Piece, Pokémon, Dragon Ball, Magic the Gathering, Yu-Gi-Oh! and more. Cross-source pricing from CardRush (JP), TCGplayer (US), and our own UK marketplace. Substrate-honest about which games each upstream covers.",
  openGraph: {
    title: "TCG Card Price Guide UK — Cambridge TCG",
    description:
      "Free, daily-updated price guide across many TCG titles. UK marketplace, JP retail, US market — substrate-honestly attributed.",
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
  const liveTiles = tiles.filter((t) => t.live !== null);
  const totalCards = liveTiles.reduce(
    (sum, t) => sum + (t.live?.card_count ?? 0),
    0,
  );

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Price Guide", item: "https://cambridgetcg.com/prices" },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-4 py-12">
        <nav aria-label="Breadcrumb" className="text-sm text-neutral-400 mb-8">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li className="text-white">Price Guide</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-bold text-white mb-4">
          TCG Card Price Guide UK
        </h1>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Provenance kind="synced" source="wholesale" cadence="daily" />
          <WhyLink href="/methodology/pricing" label="how prices work" />
          <WhyLink href="/methodology/cross-source-pricing" label="cross-source comparison" />
          <WhyLink href="/methodology/fx-rates" label={`display currency · ${currency}`} />
          <Link
            href="/prices/coverage"
            className="text-xs text-blue-400 hover:underline"
          >
            coverage map →
          </Link>
        </div>

        <p className="text-neutral-300 leading-relaxed max-w-3xl mb-10">
          Cambridge TCG publishes free, daily-updated price guides across the
          TCG landscape. Each card carries a UK retail buy price plus, where
          the upstream license permits, a trade-in store credit value.
          Cross-source signals — CardRush (Japan), TCGplayer (US, kingdom-080),
          Cardmarket (Europe, planned) — flow through the same envelope with
          per-source license tier declared honestly downstream in{" "}
          <code className="text-xs">_meta.source_license</code>.{" "}
          {totalCards > 0 &&
            `${totalCards.toLocaleString()} cards across ${liveTiles.length} game${liveTiles.length === 1 ? "" : "s"} today.`}
        </p>

        {/* Currency selector + rate table — Yu's directive 2026-05-14 */}
        <div className="mb-10 grid gap-4 lg:grid-cols-[1fr,1.2fr]">
          <CurrencySelector
            selected={currency}
            rates={rates}
            back="/prices"
          />
          <RateTablePanel rates={rates} selected={currency} />
        </div>

        <section>
          <h2 className="text-xl font-semibold text-white mb-6">
            Browse by Game
          </h2>

          {tiles.length === 0 ? (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-400 text-sm">
              No games currently curated. Add a row to{" "}
              <code className="text-xs">@/lib/prices/games-config.ts</code> to
              surface a game here.
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
                    className={`block rounded-xl border border-neutral-800 ${accent.bg} p-6 hover:${accent.border} transition-colors`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h3 className={`text-lg font-semibold ${accent.text}`}>
                        {config.display_name}
                      </h3>
                      <span className="text-xs text-neutral-500 font-mono">
                        {config.game_code}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-400 mb-3">
                      {config.seo_description}
                    </p>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        {isLive
                          ? `${cardCount.toLocaleString()} cards`
                          : "preparing coverage"}
                      </span>
                      {config.cardrush ? (
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                            config.cardrush.confirmed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                          }`}
                          title={
                            config.cardrush.confirmed
                              ? `Confirmed daily ingest from ${config.cardrush.subdomain}`
                              : `${config.cardrush.subdomain} registered but not yet confirmed`
                          }
                        >
                          {config.cardrush.confirmed
                            ? "cardrush JP"
                            : "probationary"}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="mt-14 border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            How Our Prices Work
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl mb-4">
            Prices shown are from the Cambridge TCG marketplace, updated daily
            from the wholesale catalog. The{" "}
            <strong className="text-neutral-200">Buy Price</strong> is our
            retail price for purchasing a card. The{" "}
            <strong className="text-neutral-200">We Buy</strong> price is the
            instant store credit we offer when you trade in your cards.
          </p>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl">
            For multi-source comparison (UK retail vs JP retail vs US market),
            visit any card&apos;s detail page or the{" "}
            <Link href="/prices/coverage" className="text-blue-400 hover:underline">
              coverage map
            </Link>{" "}
            to see which upstream sources we hold data from for each game.
            License tiers per source are declared in{" "}
            <Link
              href="/methodology/upstream-sources"
              className="text-blue-400 hover:underline"
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
