/**
 * /prices/[game]/movers — top recent price changes per game.
 *
 * Surfaces the time-series substrate (`price_archive` rows widened in
 * migration 0015 to hold per-source per-condition history) as
 * human-readable "what changed most this week".
 *
 * Substrate-honest about the data we have:
 *   - The wholesale catalog returns current GBP per card via fetchPrices
 *   - The cross-source archive (kingdom-080) holds historical rows
 *     keyed (card_id, snapshot_date, source, condition) — but the
 *     storefront's anonymous Falcon doesn't currently surface a public
 *     "movers" endpoint. Below we render a placeholder substrate-honest
 *     state until that endpoint ships (recursion target named in the
 *     methodology).
 *
 * In the meantime we still offer a useful surface: the **top 50 most
 *  valuable cards** in this game, which is computable from current
 *  prices alone. When the cross-source movers endpoint ships, this
 *  page composes it without changing shape.
 *
 * Kingdom-080 follow-up. Companion to /prices/coverage (the matrix view
 * of where data comes from); this is the kinetic view (where data moves).
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPrices, type PriceItem } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { Provenance, WhyLink, Audience } from "@/lib/ui";
import { fetchRates, formatGbpAs } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import { CurrencySelector } from "@/components/CurrencySelector";
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
    title: `${cfg.short_name} Most Valuable Cards — ${cfg.display_name} Price Guide UK`,
    description: `Top valuable ${cfg.display_name} cards in the UK. Sorted by current Cambridge TCG marketplace price. Updated daily.`,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

function freshestUpdate(items: PriceItem[]): string | null {
  let max: string | null = null;
  for (const it of items) {
    if (it.updated_at && (max === null || it.updated_at > max)) max = it.updated_at;
  }
  return max;
}

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

// ── Page ───────────────────────────────────────────────────────────

export default async function GameMoversPage({ params }: PageProps) {
  const { game } = await params;
  const cfg = getPriceGuideConfig(game);
  if (!cfg) notFound();

  const [data, tradeinData, rates, currency] = await Promise.all([
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
        name: "Most Valuable",
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

        <nav aria-label="Breadcrumb" className="text-sm text-neutral-400 mb-8">
          <ol className="flex items-center gap-1.5 flex-wrap">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li>
              <Link href="/prices" className="hover:text-white">
                Prices
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li>
              <Link
                href={`/prices/${cfg.slug}`}
                className="hover:text-white"
              >
                {cfg.short_name}
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li className="text-white">Most Valuable</li>
          </ol>
        </nav>

        <h1 className={`text-3xl font-bold mb-4 ${accent.text}`}>
          {cfg.short_name} — Most Valuable Cards in the UK
        </h1>

        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Provenance
            kind="synced"
            source={cfg.cardrush?.subdomain ?? "wholesale"}
            at={freshestUpdate(data.items)}
            cadence="daily"
          />
          <WhyLink href="/methodology/pricing" label="how prices work" />
          <WhyLink
            href="/methodology/cross-source-pricing"
            label="cross-source"
          />
        </div>

        <p className="text-neutral-300 leading-relaxed max-w-3xl mb-6">
          Top 50 highest-priced {cfg.display_name} cards currently
          published on Cambridge TCG. Sorted by buy price. Updated daily
          from our marketplace + cross-source archive (kingdom-080).
        </p>

        {/* Currency selector — Yu's directive 2026-05-14 */}
        <div className="mb-8">
          <CurrencySelector
            selected={currency}
            rates={rates}
            back={`/prices/${cfg.slug}/movers`}
          />
        </div>

        {/* Substrate-honest about the recent-movers gap */}
        <section className="mb-8 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-xs text-amber-200/90 leading-relaxed">
            <strong className="font-semibold">Coming soon:</strong> 7-day and
            30-day price-change deltas, computed from{" "}
            <code className="text-[10px]">price_archive</code>&apos;s daily
            cross-source rows (the substrate built in kingdom-080). The
            recent-movers endpoint is a named recursion target in{" "}
            <Link
              href="/methodology/cross-source-pricing"
              className="underline text-amber-200"
            >
              /methodology/cross-source-pricing
            </Link>
            ; this page&apos;s shape will absorb it without a redirect.
          </p>
        </section>

        {/* Top 50 table */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-white mb-5">
            Top {cards.length} by current price
          </h2>

          {cards.length === 0 ? (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-neutral-400 text-sm">
              No priced cards returned for {cfg.display_name} yet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm text-left">
                <thead className="bg-neutral-800 text-neutral-400 text-xs uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-3 w-10">#</th>
                    <th className="px-3 py-3">Card</th>
                    <th className="px-3 py-3">Set</th>
                    <th className="px-3 py-3">Rarity</th>
                    <th className="px-3 py-3 text-right">Buy Price</th>
                    <th className="px-3 py-3 text-right">We Buy</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800">
                  {cards.map((card, i) => {
                    const setSlug = card.set_code?.toLowerCase() ?? "";
                    const numberSlug = card.card_number.toLowerCase();
                    return (
                      <tr
                        key={card.sku}
                        className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
                      >
                        <td className="px-3 py-3 text-neutral-500 font-medium">
                          {i + 1}
                        </td>
                        <td className="px-3 py-3">
                          <Link
                            href={
                              setSlug
                                ? `/prices/${cfg.slug}/${setSlug}/${numberSlug}`
                                : `/product/${card.sku}`
                            }
                            className="text-white hover:text-blue-400 transition-colors"
                          >
                            {card.name}
                          </Link>
                          <span className="text-neutral-500 text-xs ml-2">
                            {card.card_number}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-neutral-400">
                          {setSlug ? (
                            <Link
                              href={`/prices/${cfg.slug}/${setSlug}`}
                              className="hover:text-blue-400 transition-colors"
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
                        <td className="px-3 py-3 text-right text-white font-medium">
                          {formatGbpAs(card.price, currency, rates)}
                        </td>
                        <td className="px-3 py-3 text-right text-green-400">
                          {card.tradein_credit
                            ? formatGbpAs(card.tradein_credit, currency, rates)
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            See also
          </h2>
          <ul className="text-sm text-neutral-300 space-y-2">
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
                className="text-blue-400 hover:underline"
              >
                /prices/coverage
              </Link>{" "}
              — cross-source coverage matrix
            </li>
            <li>
              <Link href="/market" className="text-blue-400 hover:underline">
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
