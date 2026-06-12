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
import { Provenance, WhyLink } from "@/lib/ui";
import { fetchRates } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import { CurrencySelector, CurrencyWhyLink } from "@/components/CurrencySelector";
import { Money } from "@/lib/fx/Money";
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
  searchParams: Promise<{ sort?: string }>;
}

const SORT_OPTIONS = [
  { label: "Card #", value: "number_asc" },
  { label: "Name A-Z", value: "name_asc" },
  { label: "Price ↑", value: "price_asc" },
  { label: "Price ↓", value: "price_desc" },
] as const;
const DEFAULT_SORT = "number_asc";
const VALID_SORTS = new Set<string>(SORT_OPTIONS.map((o) => o.value));

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
  if (!cfg) return { title: "Price guide not found", robots: { index: false } };

  const setCode = setSlug.toUpperCase();
  const sets = await fetchSets(cfg.slug).catch(() => []);
  const setInfo = sets.find((s) => s.code.toUpperCase() === setCode);

  // kingdom-091: head/body fidelity. When the set is not in the wholesale
  // catalog, the page handler 404s — emit a matching not-found title +
  // noindex robots so SEO / federation crawlers don't see a fake-looking
  // "SV1 SV1 Price Guide" title pointing at the 404 body.
  if (!setInfo) {
    return {
      title: `${setCode} — set not found · ${cfg.display_name}`,
      description: `No catalog entry for ${setCode} in ${cfg.display_name}.`,
      robots: { index: false },
    };
  }

  const setName = setInfo.name || setCode;

  return {
    title: `${setCode} ${setName} Price Guide — ${cfg.display_name} UK`,
    description: `Full price list for ${setCode} ${setName} — every card with UK reference and live market prices. Updated daily by Cambridge TCG.`,
    openGraph: {
      title: `${setCode} ${setName} Price Guide — ${cfg.display_name} UK`,
      description: `Full price list for ${setCode} ${setName} — every card with UK reference and live market prices.`,
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

export default async function SetPriceGuidePage({
  params,
  searchParams,
}: PageProps) {
  const { game, set: setSlug } = await params;
  const sp = await searchParams;
  const sort = sp.sort && VALID_SORTS.has(sp.sort) ? sp.sort : DEFAULT_SORT;
  const cfg = await resolveConfig(game);
  if (!cfg) notFound();

  const setCode = setSlug.toUpperCase();

  const [sets, cardsData, rates, currency] = await Promise.all([
    fetchSets(cfg.slug).catch(() => []),
    fetchPrices({
      game: cfg.slug,
      set: setCode,
      sort,
      limit: 500,
    }).catch(() => ({ items: [], total: 0 })),
    fetchRates(),
    getDisplayCurrency(),
  ]);

  const setInfo = sets.find((s) => s.code.toUpperCase() === setCode);
  // If the slug is curated but the set isn't in the wholesale catalog,
  // 404 substrate-honestly rather than render an empty page.
  if (!setInfo && cardsData.items.length === 0) notFound();

  const setName = setInfo?.name ?? setCode;
  const cardCount = setInfo?.card_count ?? cardsData.items.length;
  const releaseDate = setInfo?.release_date ?? null;

  // Substrate-honest defaults: real card data can carry a null card_number
  // (promos, odd printings). The render calls card_number.toLowerCase() in
  // the row links, so a null here was 500ing the whole set page in PROD —
  // local dev never hit it because the wholesale fetch 401s locally and the
  // list comes back empty. Coerce to safe strings so one bad row can never
  // take the page down. (Fixed 2026-06-06.)
  const cards = cardsData.items.map((item) => ({
    sku: item.sku,
    name: item.name_en || item.name || item.card_number || item.sku,
    card_number: item.card_number ?? "",
    rarity: item.rarity,
    price: retailPrice(item.price_gbp, item.channel_price),
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
            <CurrencyWhyLink />
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

        {/* Currency selector — Yu's directive 2026-05-14 */}
        <div className="mb-8">
          <CurrencySelector
            selected={currency}
            rates={rates}
            back={`/prices/${cfg.slug}/${setSlug}`}
          />
        </div>

        {/* kingdom-091 closure (T3): anticipated-set placeholder.
            When setInfo exists but no cards have been scraped yet, render
            a substrate-honest "anticipated" panel surfacing the expected
            upstream sources + back-link, instead of a bare "No cards"
            table row. The page handler already 404s when the set isn't
            registered at all — this branch is *only* the "registered,
            pre-ingest" case (which the [set] handler explicitly tolerates). */}
        {cards.length === 0 && (
          <section className="mb-10 rounded-lg border border-amber-500/30 bg-amber-500/5 p-5">
            <h2 className="text-sm font-semibold text-amber-300 uppercase tracking-wider mb-3">
              Anticipated coverage — no observed cards yet
            </h2>
            <p className="text-sm text-amber-100/80 leading-relaxed mb-4 max-w-3xl">
              <strong className="text-amber-200">
                {setCode}
                {setInfo?.name && setInfo.name !== setCode ? ` ${setInfo.name}` : ""}
              </strong>{" "}
              is registered in the wholesale catalog
              {cardCount > 0 ? ` with ${cardCount} expected cards` : ""}
              {releaseDate ? ` (released ${releaseDate})` : ""}, but the price
              pipeline hasn&rsquo;t accumulated any observations yet.
              Coverage rolls out per source; the table will populate as soon as
              the first daily scrape lands.
            </p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="text-[10px] uppercase tracking-wider text-amber-200/70">
                Expected upstream sources:
              </span>
              {cfg.cardrush && (
                <span
                  className="inline-flex items-baseline gap-1.5 text-[11px] px-2 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-200 font-mono"
                  title={
                    cfg.cardrush.confirmed
                      ? `CardRush subdomain confirmed: ${cfg.cardrush.subdomain}`
                      : `CardRush subdomain registered but unconfirmed: ${cfg.cardrush.subdomain}`
                  }
                >
                  {cfg.cardrush.subdomain}
                  {!cfg.cardrush.confirmed && (
                    <span className="text-[9px] uppercase tracking-wider text-amber-400/70">
                      probationary
                    </span>
                  )}
                </span>
              )}
              <span className="inline-block text-[11px] px-2 py-0.5 rounded border border-neutral-700 bg-neutral-900 text-neutral-400 font-mono">
                wholesale-rds
              </span>
            </div>

            <p className="text-xs text-amber-100/60 leading-relaxed">
              See{" "}
              <Link
                href={`/prices/${cfg.slug}`}
                className="underline text-amber-200 hover:text-amber-100"
              >
                other {cfg.short_name} sets
              </Link>
              {" · "}
              <Link
                href="/prices/coverage"
                className="underline text-amber-200 hover:text-amber-100"
              >
                full coverage map
              </Link>
              {" · "}
              <Link
                href="/api/v1/sources"
                className="underline text-amber-200 hover:text-amber-100"
              >
                /api/v1/sources
              </Link>{" "}
              for ingest-pipeline status.
            </p>
          </section>
        )}

        {/* Card table — only rendered when there are cards. The empty
            state is the anticipated-set panel above. */}
        {cards.length > 0 && (
        <section className="mb-14">
          {/* Sort pills */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <span className="text-xs text-neutral-500 uppercase tracking-wider">
              Sort:
            </span>
            {SORT_OPTIONS.map((opt) => {
              const active = sort === opt.value;
              const href =
                opt.value === DEFAULT_SORT
                  ? `/prices/${cfg.slug}/${setSlug}`
                  : `/prices/${cfg.slug}/${setSlug}?sort=${opt.value}`;
              return (
                <Link
                  key={opt.value}
                  href={href}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition ${
                    active
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/40"
                      : "bg-neutral-800 text-neutral-400 hover:text-white"
                  }`}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm text-left">
              <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3">Card #</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Rarity</th>
                  <th className="px-3 py-3 text-right">Reference</th>
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
                      <Link
                        href={`/prices/${cfg.slug}/${setSlug.toLowerCase()}/${card.card_number.toLowerCase()}`}
                        className="hover:text-blue-400 transition-colors"
                      >
                        {card.card_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/prices/${cfg.slug}/${setSlug.toLowerCase()}/${card.card_number.toLowerCase()}`}
                        className="text-white hover:text-blue-400 transition-colors"
                      >
                        {card.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <RarityBadge rarity={card.rarity} />
                    </td>
                    <td className="px-3 py-3 text-right text-white font-medium">
                      <Money value={card.price} />
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
              </tbody>
            </table>
          </div>
        </section>
        )}

        {/* Pricing explanation */}
        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            About These Prices
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl mb-4">
            {cfg.pricing_note}{" "}
            The <strong className="text-neutral-200">Reference price</strong> is our
            published price-guide observation — not an offer.
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
