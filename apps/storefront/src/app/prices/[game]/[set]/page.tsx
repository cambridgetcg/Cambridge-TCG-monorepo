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
    description: `Observed catalog rows for ${setCode} ${setName}, with policy-bound GBP reference values where held. This page does not claim a complete set or refresh cadence.`,
    openGraph: {
      title: `${setCode} ${setName} Price Guide — ${cfg.display_name} UK`,
      description: `Observed catalog rows for ${setCode} ${setName}, with policy-bound reference values where held.`,
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

  // Collectors-first (2026-07-06): the tradein-credit channel fetch and
  // its "We Buy" column are gone — the house buys nothing. The guide now
  // shows the reference price and points at the collectors' market.
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
            <li>
              <Link
                href={`/prices/${cfg.slug}`}
                className="hover:text-ink transition-colors"
              >
                {cfg.short_name}
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li className="text-ink">{setCode}</li>
          </ol>
        </nav>

        {/* Set header */}
        <header className="mb-10">
          <h1 className="text-3xl font-bold text-ink mb-2">
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
          <p className="text-ink-muted leading-relaxed max-w-3xl mb-4">
            {intro}
          </p>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-ink-muted">
              <strong className="text-ink-muted">{cardCount}</strong> cards
            </span>
            {releaseDate && (
              <span className="text-ink-muted">
                Released{" "}
                <strong className="text-ink-muted">{releaseDate}</strong>
              </span>
            )}
            <span className="text-ink-muted">
              Game:{" "}
              <Link
                href={`/prices/${cfg.slug}`}
                className="text-info hover:underline"
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
          <section className="mb-10 rounded-lg border border-accent/30 bg-accent-wash p-5">
            <h2 className="text-sm font-semibold text-accent uppercase tracking-wider mb-3">
              Anticipated coverage — no observed cards yet
            </h2>
            <p className="text-sm text-ink-muted leading-relaxed mb-4 max-w-3xl">
              <strong className="text-ink">
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
              <span className="text-[10px] uppercase tracking-wider text-ink-faint">
                Expected upstream sources:
              </span>
              {cfg.cardrush && (
                <span
                  className="inline-flex items-baseline gap-1.5 text-[11px] px-2 py-0.5 rounded border border-accent/30 bg-surface text-accent-strong font-mono"
                  title={
                    cfg.cardrush.confirmed
                      ? `CardRush subdomain confirmed: ${cfg.cardrush.subdomain}`
                      : `CardRush subdomain registered but unconfirmed: ${cfg.cardrush.subdomain}`
                  }
                >
                  {cfg.cardrush.subdomain}
                  {!cfg.cardrush.confirmed && (
                    <span className="text-[9px] uppercase tracking-wider text-warning">
                      probationary
                    </span>
                  )}
                </span>
              )}
              <span className="inline-block text-[11px] px-2 py-0.5 rounded border border-border-subtle bg-surface text-ink-muted font-mono">
                wholesale-rds
              </span>
            </div>

            <p className="text-xs text-ink-faint leading-relaxed">
              See{" "}
              <Link
                href={`/prices/${cfg.slug}`}
                className="underline text-accent hover:text-accent-strong"
              >
                other {cfg.short_name} sets
              </Link>
              {" · "}
              <Link
                href="/prices/coverage"
                className="underline text-accent hover:text-accent-strong"
              >
                full coverage map
              </Link>
              {" · "}
              <Link
                href="/api/v1/sources"
                className="underline text-accent hover:text-accent-strong"
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
            <span className="text-xs text-ink-faint uppercase tracking-wider">
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
                      ? "bg-accent-wash text-accent-strong border border-accent/30"
                      : "bg-surface-subtle text-ink-muted hover:text-ink"
                  }`}
                >
                  {opt.label}
                </Link>
              );
            })}
          </div>
          <div className="overflow-x-auto rounded-lg border border-border-subtle">
            <table className="w-full text-sm text-left">
              <thead className="bg-surface-subtle text-ink-muted text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-3">Card #</th>
                  <th className="px-3 py-3">Name</th>
                  <th className="px-3 py-3">Rarity</th>
                  <th className="px-3 py-3 text-right">Buy Price</th>
                  <th className="px-3 py-3 text-right">Market</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {cards.map((card) => (
                  <tr
                    key={card.sku}
                    className="bg-surface hover:bg-surface-subtle transition-colors"
                  >
                    <td className="px-3 py-3 text-ink-muted font-mono text-xs">
                      <Link
                        href={`/prices/${cfg.slug}/${setSlug.toLowerCase()}/${card.card_number.toLowerCase()}`}
                        className="hover:text-info transition-colors"
                      >
                        {card.card_number}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/prices/${cfg.slug}/${setSlug.toLowerCase()}/${card.card_number.toLowerCase()}`}
                        className="text-ink hover:text-info transition-colors"
                      >
                        {card.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3">
                      <RarityBadge rarity={card.rarity} />
                    </td>
                    <td className="px-3 py-3 text-right text-ink font-medium">
                      <Money value={card.price} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/market/${card.sku}`}
                        className="text-info hover:underline text-xs"
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
        <section className="border-t border-border-subtle pt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">
            About These Prices
          </h2>
          <p className="text-ink-muted text-sm leading-relaxed max-w-3xl mb-4">
            {cfg.pricing_note}{" "}
            The <strong className="text-ink-muted">Buy Price</strong> is our
            catalogue reference price — a policy-bound derived value, not an offer
            or an open-data grant. Cambridge TCG
            no longer buys cards itself; selling happens between collectors on
            the market.
          </p>
          <p className="text-ink-muted text-sm leading-relaxed max-w-3xl">
            <Link href="/market" className="text-info hover:underline">
              Visit the live market
            </Link>{" "}
            to buy, sell, or place bid/ask orders on any card.
          </p>
        </section>
      </main>
    </>
  );
}
