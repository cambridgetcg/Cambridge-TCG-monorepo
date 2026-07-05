/**
 * /prices/[game]/movers — biggest 7-day price changes per game.
 *
 * Renders the cardrush-derived 7-day movers via the wholesale
 * `/api/v1/prices/movers` endpoint (Falcon-couriered through
 * `fetchMovers`). Substrate-honest about provenance: every row is
 * a computed delta over cross-source archive (kingdom-080) rows,
 * floored at £10 seven days ago to keep noise out.
 *
 * Quiet-week behaviour: when `movers.length === 0`, the page
 * degrades visibly to the top-50 most-valuable table (built from
 * `fetchPrices` + tradein channel) and discloses the substitution
 * inline. Raw `price_then`/`price_now` never reach the render path
 * — that's an internal-only license boundary.
 *
 * Companion to /prices/coverage (the matrix view of where data
 * comes from); this is the kinetic view (where data moves).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  fetchPrices,
  fetchMovers,
  type PriceItem,
  type MoverItem,
} from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { Provenance, WhyLink, Audience } from "@/lib/ui";
import { fetchRates } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import { CurrencySelector } from "@/components/CurrencySelector";
import { Money } from "@/lib/fx/Money";
import {
  getPriceGuideConfig,
  ACCENT_CLASSES,
} from "@/lib/prices/games-config";

interface PageProps {
  params: Promise<{ game: string }>;
}

// ── Dynamic metadata ────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { game } = await params;
  const cfg = getPriceGuideConfig(game);
  if (!cfg) return { title: "Movers — not found" };
  return {
    title: `${cfg.short_name} Movers — 7-Day Price Changes — ${cfg.display_name} Price Guide UK`,
    description: `Biggest 7-day movers in ${cfg.display_name}. Cardrush-derived percent change with a £10 floor. Updated daily.`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

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

// ── Page ───────────────────────────────────────────────────────────

export default async function GameMoversPage({ params }: PageProps) {
  const { game } = await params;
  const cfg = getPriceGuideConfig(game);
  if (!cfg) notFound();

  const [moversData, data, tradeinData, rates, currency] = await Promise.all([
    fetchMovers({
      game: cfg.slug,
      window: "7d",
      min_price: 10,
      limit: 50,
    }),
    fetchPrices({
      game: cfg.slug,
      sort: "price_desc",
      limit: 50,
    }).catch(() => ({ items: [], total: 0 } as { items: PriceItem[]; total: number })),
    fetchPrices({
      game: cfg.slug,
      sort: "price_desc",
      limit: 50,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] } as { items: PriceItem[] })),
    fetchRates(),
    getDisplayCurrency(),
  ]);

  const hasMovers = moversData.movers.length > 0;

  const tradeinMap = new Map<string, number>();
  for (const item of tradeinData.items) {
    if (item.channel_price && item.channel_price > 0) {
      tradeinMap.set(item.sku, item.channel_price);
    }
  }

  const cards = data.items.map((item) => ({
    sku: item.sku,
    name: item.name_en || item.name || item.card_number,
    card_number: item.card_number,
    set_code: item.set_code,
    set_name: item.set_name,
    rarity: item.rarity,
    price: retailPrice(item.price_gbp, item.channel_price),
    tradein_credit: tradeinMap.get(item.sku) ?? null,
  }));

  const accent = ACCENT_CLASSES[cfg.accent];

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Price Guide", item: "https://cambridgetcg.com/prices" },
      {
        "@type": "ListItem",
        position: 3,
        name: cfg.display_name,
        item: `https://cambridgetcg.com/prices/${cfg.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: "Movers",
        item: `https://cambridgetcg.com/prices/${cfg.slug}/movers`,
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
        <Audience
          kind="public-documentation"
          contexts={["prices", cfg.slug, "movers"]}
        />

        <nav aria-label="Breadcrumb" className="text-sm text-ink-muted mb-8">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link href="/" className="hover:text-ink">
                Home
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li>
              <Link href="/prices" className="hover:text-ink">
                Prices
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li>
              <Link
                href={`/prices/${cfg.slug}`}
                className="hover:text-ink"
              >
                {cfg.short_name}
              </Link>
            </li>
            <li className="text-ink-faint">/</li>
            <li className="text-ink">Movers</li>
          </ol>
        </nav>

        <h1 className={`text-3xl font-bold mb-4 ${accent.text}`}>
          {cfg.short_name} — Biggest 7-Day Movers
        </h1>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Provenance
            kind="computed"
            source="cardrush"
            at={moversData.computed_at}
            cadence="daily"
          />
          <WhyLink
            href="/methodology/cross-source-pricing"
            label="how movers are computed"
          />
        </div>

        <p className="text-ink-muted leading-relaxed max-w-3xl mb-6">
          Top 50 {cfg.display_name} cards by absolute 7-day percent
          change. Cardrush-derived. Cards worth under £10 seven days
          ago are excluded as noise. Updated daily.
        </p>

        {/* Currency selector — Yu's directive 2026-05-14 */}
        <div className="mb-8">
          <CurrencySelector
            selected={currency}
            rates={rates}
            back={`/prices/${cfg.slug}/movers`}
          />
        </div>

        {/* Movers table (primary) — falls back to most-valuable on a quiet week */}
        {hasMovers ? (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-ink mb-5">
              Top {moversData.movers.length} biggest 7-day movers
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border-subtle">
              <table className="w-full text-sm text-left">
                <thead className="bg-surface-subtle text-ink-muted text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-10">#</th>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Set</th>
                    <th className="px-3 py-3">Rarity</th>
                    <th className="px-3 py-3 text-right">7d Δ%</th>
                    <th className="px-3 py-3 text-right">Buy Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {moversData.movers.map((m: MoverItem, i: number) => {
                    const setSlug = m.set_code?.toLowerCase() ?? "";
                    const numberSlug = m.card_number.toLowerCase();
                    const displayName =
                      m.name_en || m.name || m.card_number;
                    const up = m.pct_change >= 0;
                    return (
                      <tr
                        key={m.sku}
                        className="bg-surface hover:bg-surface-subtle transition-colors"
                      >
                        <td className="px-3 py-3 text-ink-faint font-medium">
                          {i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={
                              setSlug
                                ? `/prices/${cfg.slug}/${setSlug}/${numberSlug}`
                                : `/product/${m.sku}`
                            }
                            className="text-ink hover:text-info transition-colors"
                          >
                            {displayName}
                          </Link>
                          <span className="text-ink-faint text-xs ml-2">
                            {m.card_number}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-ink-muted">
                          {setSlug ? (
                            <Link
                              href={`/prices/${cfg.slug}/${setSlug}`}
                              className="hover:text-info transition-colors"
                            >
                              {m.set_code}
                            </Link>
                          ) : (
                            m.set_code
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <RarityBadge rarity={m.rarity} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <span
                            className={
                              up
                                ? "text-ok font-medium"
                                : "text-danger font-medium"
                            }
                          >
                            {up ? "▲" : "▼"} {Math.abs(m.pct_change).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-ink font-medium">
                          <Money value={m.channel_price} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-ink-faint mt-3">
              Cardrush-derived; £10 floor on the 7-day-ago price. Quiet weeks
              fall back to the most-valuable table below.
            </p>
          </section>
        ) : (
          <section className="mb-8 rounded-lg border border-border-subtle bg-surface px-4 py-3">
            <p className="text-sm text-ink-muted">
              <strong className="font-semibold text-ink">
                No qualifying movers this week.
              </strong>{" "}
              £10 floor, 7-day window. Showing top valuable cards instead.
            </p>
          </section>
        )}

        {/* Most-valuable table — always present when no movers, also as a secondary surface */}
        {!hasMovers && (
          <section className="mb-12">
            <h2 className="text-xl font-semibold text-ink mb-5">
              Top {data.items.length} by current price
            </h2>
            {data.items.length === 0 ? (
              <div className="rounded-lg border border-border-subtle bg-surface p-6 text-ink-muted text-sm">
                No priced cards returned for {cfg.display_name} yet.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border-subtle">
                <table className="w-full text-sm text-left">
                  <thead className="bg-surface-subtle text-ink-muted text-xs uppercase tracking-wider">
                    <tr>
                      <th className="px-3 py-3 w-10">#</th>
                      <th className="px-3 py-3">Card</th>
                      <th className="px-3 py-3">Set</th>
                      <th className="px-3 py-3">Rarity</th>
                      <th className="px-3 py-3 text-right">Buy Price</th>
                      <th className="px-3 py-3 text-right">We Buy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {cards.map((card, i) => {
                      const setSlug = card.set_code?.toLowerCase() ?? "";
                      const numberSlug = card.card_number.toLowerCase();
                      return (
                        <tr
                          key={card.sku}
                          className="bg-surface hover:bg-surface-subtle transition-colors"
                        >
                          <td className="px-3 py-3 text-ink-faint font-medium">
                            {i + 1}
                          </td>
                          <td className="px-3 py-3">
                            <Link
                              href={
                                setSlug
                                  ? `/prices/${cfg.slug}/${setSlug}/${numberSlug}`
                                  : `/product/${card.sku}`
                              }
                              className="text-ink hover:text-info transition-colors"
                            >
                              {card.name}
                            </Link>
                            <span className="text-ink-faint text-xs ml-2">
                              {card.card_number}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-ink-muted">
                            {setSlug ? (
                              <Link
                                href={`/prices/${cfg.slug}/${setSlug}`}
                                className="hover:text-info transition-colors"
                              >
                                {card.set_code}
                              </Link>
                            ) : (
                              card.set_code
                            )}
                          </td>
                          <td className="px-3 py-3">
                            <RarityBadge rarity={card.rarity} />
                          </td>
                          <td className="px-3 py-3 text-right text-ink font-medium">
                            <Money value={card.price} />
                          </td>
                          <td className="px-3 py-3 text-right text-bid">
                            <Money
                              value={card.tradein_credit}
                              treatZeroAsMissing
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        <section className="border-t border-border-subtle pt-8">
          <h2 className="text-lg font-semibold text-ink mb-3">
            See also
          </h2>
          <ul className="text-sm text-ink-muted space-y-2">
            <li>
              <Link
                href={`/prices/${cfg.slug}`}
                className={`${accent.text} hover:underline`}
              >
                {cfg.display_name} price guide
              </Link>{" "}
              — full set list + top-20 valuable cards
            </li>
            <li>
              <Link
                href="/prices/coverage"
                className="text-info hover:underline"
              >
                /prices/coverage
              </Link>{" "}
              — cross-source coverage matrix
            </li>
            <li>
              <Link href="/market" className="text-info hover:underline">
                /market
              </Link>{" "}
              — live P2P marketplace with bid/ask depth
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
