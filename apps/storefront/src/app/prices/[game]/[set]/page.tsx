/**
 * /prices/[game]/[set] — per-set UK price guide.
 *
 * Parametric replacement for /prices/one-piece/[set]/page.tsx
 * (kingdom-084). Renders from the typed config; substrate-honest about
 * coverage.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchGames, fetchPrices, fetchSets, type PriceItem } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { formatPrice } from "@/lib/format";
import { Provenance, WhyLink } from "@/lib/ui";
import {
  getPriceGuideConfig,
  listPriceGuideSlugs,
  synthesizeConfigFromCatalog,
  type PriceGuideGameConfig,
} from "@/lib/prices/games-config";

/** Resolve config: curated, else synthesize from catalog, else null. */
async function resolveConfig(slug: string): Promise<PriceGuideGameConfig | null> {
  const curated = getPriceGuideConfig(slug);
  if (curated) return curated;
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
  params: Promise<{ game: string; set: string }>;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function freshestUpdate(items: PriceItem[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

function fillTemplate(
  template: string,
  vars: { setCode: string; setName: string; cardCount: number },
): string {
  return template
    .replace(/\{\{setCode\}\}/g, vars.setCode)
    .replace(/\{\{setName\}\}/g, vars.setName)
    .replace(/\{\{cardCount\}\}/g, String(vars.cardCount));
}

/* ------------------------------------------------------------------ */
/*  Dynamic metadata                                                   */
/* ------------------------------------------------------------------ */

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game, set: setSlug } = await params;
  const cfg = await resolveConfig(game);
  if (!cfg) return { title: "Price guide not found" };

  const setCode = setSlug.toUpperCase();
  const sets = await fetchSets(cfg.slug).catch(() => []);
  const setInfo = sets.find((s) => s.code.toUpperCase() === setCode);
  const setName = setInfo?.name ?? setCode;

  return {
    title: `${setCode} ${setName} Price Guide — ${cfg.display_name} UK`,
    description: `Full price list for ${setCode} ${setName} — every card with UK retail and trade-in prices. Updated daily by Cambridge TCG.`,
    openGraph: {
      title: `${setCode} ${setName} Price Guide — ${cfg.display_name} UK`,
      description: `Full price list for ${setCode} ${setName} — every card with UK retail and trade-in prices.`,
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Static params for known game/set pairs                             */
/* ------------------------------------------------------------------ */

export async function generateStaticParams() {
  const slugs = listPriceGuideSlugs();
  const all: { game: string; set: string }[] = [];
  for (const slug of slugs) {
    const sets = await fetchSets(slug).catch(() => []);
    for (const s of sets) {
      all.push({ game: slug, set: s.code.toLowerCase() });
    }
  }
  return all;
}

/* ------------------------------------------------------------------ */
/*  Rarity badge                                                       */
/* ------------------------------------------------------------------ */

function RarityBadge({ rarity }: { rarity: string | null }) {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  let cls = "bg-neutral-700 text-neutral-400";
  if (r === "SR" || r === "SEC" || r === "SCR" || r === "L" || r === "SP")
    cls = "bg-yellow-500/20 text-yellow-400";
  else if (r === "R" || r === "RR" || r === "SSR")
    cls = "bg-purple-500/20 text-purple-400";
  else if (r === "UC") cls = "bg-blue-500/20 text-blue-400";
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

export default async function SetPriceGuidePage({ params }: PageProps) {
  const { game, set: setSlug } = await params;
  const cfg = await resolveConfig(game);
  if (!cfg) notFound();

  const setCode = setSlug.toUpperCase();

  const [sets, cardsData, tradeinData] = await Promise.all([
    fetchSets(cfg.slug).catch(() => []),
    fetchPrices({
      game: cfg.slug,
      set: setCode,
      sort: "price_desc",
      limit: 500,
    }).catch(() => ({ items: [], total: 0 })),
    fetchPrices({
      game: cfg.slug,
      set: setCode,
      sort: "price_desc",
      limit: 500,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] })),
  ]);

  const setInfo = sets.find((s) => s.code.toUpperCase() === setCode);
  // If the slug is curated but the set isn't in the wholesale catalog,
  // 404 substrate-honestly rather than render an empty page.
  if (!setInfo && cardsData.items.length === 0) notFound();

  const setName = setInfo?.name ?? setCode;
  const cardCount = setInfo?.card_count ?? cardsData.items.length;
  const releaseDate = setInfo?.release_date ?? null;

  const tradeinMap = new Map<string, number>();
  for (const item of tradeinData.items) {
    if (item.channel_price && item.channel_price > 0) {
      tradeinMap.set(item.sku, item.channel_price);
    }
  }

  const cards = cardsData.items.map((item) => ({
    sku: item.sku,
    name: item.name_en || item.name || item.card_number,
    card_number: item.card_number,
    rarity: item.rarity,
    price: retailPrice(item.price_gbp, item.channel_price),
    tradein_credit: tradeinMap.get(item.sku) ?? null,
  }));

  const intro = fillTemplate(cfg.set_intro_template, {
    setCode,
    setName,
    cardCount,
  });

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
      {
        "@type": "ListItem",
        position: 4,
        name: `${setCode} ${setName}`,
        item: `https://cambridgetcg.com/prices/${cfg.slug}/${setSlug}`,
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
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="text-sm text-neutral-400 mb-8">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white transition-colors">
                Home
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li>
              <Link
                href="/prices"
                className="hover:text-white transition-colors"
              >
                Prices
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li>
              <Link
                href={`/prices/${cfg.slug}`}
                className="hover:text-white transition-colors"
              >
                {cfg.short_name}
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li className="text-white">{setCode}</li>
          </ol>
        </nav>

        {/* Set header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-white mb-2">
            {setCode} {setName} — Price Guide
          </h1>
          <div className="mb-4 flex items-center gap-3 text-xs">
            <Provenance
              kind="synced"
              source={cfg.cardrush?.subdomain ?? "wholesale"}
              at={freshestUpdate(cardsData.items)}
              cadence="daily"
            />
            <WhyLink href="/methodology/pricing" label="how prices work" />
          </div>
          <p className="text-neutral-300 leading-relaxed max-w-3xl mb-4">
            {intro}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-neutral-400">
              <strong className="text-neutral-200">{cardCount}</strong> cards
            </span>
            {releaseDate && (
              <span className="text-neutral-400">
                Released{" "}
                <strong className="text-neutral-200">{releaseDate}</strong>
              </span>
            )}
            <span className="text-neutral-400">
              Game:{" "}
              <Link
                href={`/prices/${cfg.slug}`}
                className="text-blue-400 hover:underline"
              >
                {cfg.display_name}
              </Link>
            </span>
          </div>
        </header>

        {/* Card table */}
        <section className="mb-14">
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3">Card #</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Rarity</th>
                  <th className="px-3 py-3 text-right">Buy Price</th>
                  <th className="px-3 py-3 text-right">We Buy (Credit)</th>
                  <th className="px-3 py-3 text-right">Market</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800">
                {cards.map((card) => (
                  <tr
                    key={card.sku}
                    className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
                  >
                    <td className="px-3 py-3 text-neutral-400 font-mono text-xs">
                      {card.card_number}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/product/${card.sku}`}
                        className="text-white hover:text-blue-400 transition-colors"
                      >
                        {card.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <RarityBadge rarity={card.rarity} />
                    </td>
                    <td className="px-3 py-3 text-right text-white font-medium">
                      {formatPrice(card.price)}
                    </td>
                    <td className="px-3 py-3 text-right text-green-400">
                      {card.tradein_credit
                        ? formatPrice(card.tradein_credit)
                        : "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/market/${card.sku}`}
                        className="text-blue-400 hover:underline text-xs"
                      >
                        Trade
                      </Link>
                    </td>
                  </tr>
                ))}
                {cards.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-neutral-500"
                    >
                      No cards found for this set.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Pricing explanation */}
        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            About These Prices
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl mb-4">
            {cfg.pricing_note}{" "}
            The <strong className="text-neutral-200">Buy Price</strong> is our
            retail price. The{" "}
            <strong className="text-neutral-200">We Buy (Credit)</strong> price
            is the instant store credit we offer when you trade in your cards.
          </p>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl">
            <Link href="/market" className="text-blue-400 hover:underline">
              Visit the live market
            </Link>{" "}
            to buy, sell, or place bid/ask orders on any card.
          </p>
        </section>
      </main>
    </>
  );
}
