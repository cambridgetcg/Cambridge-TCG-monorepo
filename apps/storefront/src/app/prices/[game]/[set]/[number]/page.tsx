/**
 * /prices/[game]/[set]/[number] — per-card price-guide detail.
 *
 * The natural next stop after the per-set table. Where /product/[sku] is
 * the marketplace transactional surface (buy / sell / list), this is the
 * price-guide-native surface: just the data — UK retail, cross-source
 * signal, license tier per source, history teaser.
 *
 * URL shape uses (game, set, number) rather than SKU because:
 *   - SEO: "one piece op01 001" is searchable; "op-op01-001-en" isn't
 *   - human-readable breadcrumbs compose naturally
 *   - the price-guide reader rarely has a SKU in hand
 *
 * Substrate-honest about authentication boundaries: cross-source history
 * is auth-gated (CardRush ToS + TCGplayer partner agreement); anonymous
 * readers see the current snapshot + an invitation to sign in for full
 * cross-source history.
 *
 * **Refactor (kingdom-080 follow-up):** the page now reads from
 * `loadCardState(...)` in `@/lib/prices/state` — one composer feeds the
 * HTML reading + the JSON sibling at /api/v1/prices/games/[game]/sets/[set]/cards/[number]
 * + the math-mirror at /api/v1/universal/card/[sku]. Three readings,
 * one substrate — sister's S37 / S39 fan-out pattern applied.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Provenance, WhyLink, Audience } from "@/lib/ui";
import { ACCENT_CLASSES } from "@/lib/prices/games-config";
import { loadCardState } from "@/lib/prices/state";
import { RarityBadge } from "@/lib/ui/prices/RarityBadge";
import { fetchRates } from "@/lib/fx/rates";
import { getDisplayCurrency } from "@/lib/fx/currency-server";
import { CurrencySelector, CurrencyWhyLink } from "@/components/CurrencySelector";
import { Money } from "@/lib/fx/Money";

interface PageProps {
  params: Promise<{ game: string; set: string; number: string }>;
}

// ── Dynamic metadata ────────────────────────────────────────────────

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { game, set, number } = await params;
  const state = await loadCardState(game, set, number);
  if (!state) {
    return {
      title: `${set.toUpperCase()} ${number.toUpperCase()} — Card Price Guide UK`,
      description: "Card price information.",
    };
  }
  const cardName = state.card.name;
  const setCode = state.set.code.toUpperCase();
  return {
    title: `${cardName} ${setCode} ${state.card.card_number} — ${state.config.short_name} Price UK`,
    description: `UK price for ${cardName} (${setCode} ${state.card.card_number}) from ${state.config.display_name}. Cross-source pricing from Cambridge TCG marketplace plus international upstream signals. Updated daily.`,
    openGraph: {
      title: `${cardName} ${setCode} ${state.card.card_number} — ${state.config.short_name} Price UK`,
      description: `UK price for ${cardName} from ${state.config.display_name}. Updated daily.`,
      images: state.card.image_url ? [{ url: state.card.image_url }] : undefined,
    },
  };
}

// ── Page ───────────────────────────────────────────────────────────

export default async function CardPriceGuidePage({ params }: PageProps) {
  const { game, set, number } = await params;

  const [state, rates, currency] = await Promise.all([
    loadCardState(game, set, number),
    fetchRates(),
    getDisplayCurrency(),
  ]);
  if (!state) notFound();

  const { config, set: setMeta, card, cross_source_signals: signals } = state;
  const accent = ACCENT_CLASSES[config.accent];
  const setCode = setMeta.code.toUpperCase();
  const setSlug = setMeta.code.toLowerCase();
  const numberSlug = card.card_number.toLowerCase();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://cambridgetcg.com" },
      { "@type": "ListItem", position: 2, name: "Price Guide", item: "https://cambridgetcg.com/prices" },
      {
        "@type": "ListItem",
        position: 3,
        name: config.display_name,
        item: `https://cambridgetcg.com/prices/${config.slug}`,
      },
      {
        "@type": "ListItem",
        position: 4,
        name: `${setCode} ${setMeta.name}`,
        item: `https://cambridgetcg.com/prices/${config.slug}/${setSlug}`,
      },
      {
        "@type": "ListItem",
        position: 5,
        name: `${card.name} (${card.card_number})`,
        item: `https://cambridgetcg.com/prices/${config.slug}/${setSlug}/${numberSlug}`,
      },
    ],
  };

  const productJsonLd = card.price_gbp
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: `${card.name} - ${config.display_name} ${setCode}`,
        image: card.image_url ?? undefined,
        description: `${card.name} (${card.card_number}) from ${config.display_name} ${setMeta.name} (${setCode}).`,
        sku: card.sku,
        offers: {
          "@type": "Offer",
          url: `https://cambridgetcg.com/product/${card.sku}`,
          priceCurrency: "GBP",
          price: card.price_gbp.toFixed(2),
          availability:
            card.stock > 0
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
          seller: { "@type": "Organization", name: "Cambridge TCG" },
        },
      }
    : null;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {productJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
        />
      )}

      <main className="max-w-5xl mx-auto px-4 py-12">
        <Audience
          kind="public-documentation"
          contexts={["prices", config.slug, "card-detail"]}
        />

        {/* Breadcrumb */}
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
                href={`/prices/${config.slug}`}
                className="hover:text-white"
              >
                {config.short_name}
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li>
              <Link
                href={`/prices/${config.slug}/${setSlug}`}
                className="hover:text-white"
              >
                {setCode}
              </Link>
            </li>
            <li className="text-neutral-600">/</li>
            <li className="text-white truncate max-w-[40ch]">{card.card_number}</li>
          </ol>
        </nav>

        {/* Hero — card image + headline + meta */}
        <header className="grid gap-8 md:grid-cols-[280px_1fr] mb-10">
          {card.image_url ? (
            <div className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.image_url}
                alt={card.name + " card art"}
                className="rounded-xl border border-neutral-800 w-full max-w-[280px] aspect-[5/7] object-cover bg-neutral-900"
                loading="eager"
              />
            </div>
          ) : (
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 aspect-[5/7] flex items-center justify-center text-neutral-600 text-xs">
              No image
            </div>
          )}

          <div>
            <div className="flex items-center gap-3 mb-2 text-xs">
              <span className="font-mono text-neutral-500">{card.card_number}</span>
              <RarityBadge rarity={card.rarity} size="sm" />
              <span className="text-neutral-500">{setCode}</span>
            </div>

            <h1 className={`text-3xl font-bold mb-3 ${accent.text}`}>
              {card.name}
            </h1>

            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Provenance
                kind="synced"
                source={config.cardrush?.subdomain ?? "wholesale"}
                at={state._provenance.as_of}
                cadence="daily"
              />
              <WhyLink href="/methodology/pricing" label="how prices work" />
              <WhyLink
                href="/methodology/cross-source-pricing"
                label="cross-source"
              />
              <CurrencyWhyLink />
              <Link
                href={`/api/v1/prices/games/${config.slug}/sets/${setSlug}/cards/${numberSlug}`}
                className="text-xs text-blue-400 hover:underline"
                title="JSON sibling — same data through the data-pantry envelope"
              >
                JSON →
              </Link>
            </div>

            {/* Currency selector — Yu's directive 2026-05-14 */}
            <div className="mb-4">
              <CurrencySelector
                selected={currency}
                rates={rates}
                back={`/prices/${config.slug}/${setSlug}/${numberSlug}`}
              />
            </div>

            {/* Headline price */}
            <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5 mb-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                    Buy from us
                  </div>
                  <div className="text-2xl font-bold text-white">
                    <Money value={card.price_gbp} />
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    {card.stock > 0
                      ? `${card.stock} in UK stock`
                      : "currently out of stock"}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                    We buy (credit)
                  </div>
                  <div className="text-2xl font-bold text-emerald-400">
                    <Money value={card.tradein_credit_gbp} />
                  </div>
                  <div className="text-[10px] text-neutral-500 mt-1">
                    instant store credit
                  </div>
                </div>
                <div>
                  <div className="text-xs text-neutral-500 uppercase tracking-wider mb-1">
                    SKU
                  </div>
                  <div className="text-sm font-mono text-neutral-300 break-all">
                    {card.sku}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/product/${card.sku}`}
                className="inline-block rounded-lg bg-amber-500 hover:bg-amber-400 text-neutral-900 font-semibold text-sm px-4 py-2 transition-colors"
              >
                View in store →
              </Link>
              <Link
                href={`/market/${card.sku}`}
                className="inline-block rounded-lg border border-neutral-700 hover:border-neutral-500 text-white text-sm px-4 py-2 transition-colors"
              >
                Open market depth
              </Link>
              <Link
                href={`/cards/${card.sku}/market`}
                className="inline-block rounded-lg border border-neutral-700 hover:border-neutral-500 text-white text-sm px-4 py-2 transition-colors"
              >
                Read-only mirror
              </Link>
            </div>
          </div>
        </header>

        {/* Cross-source signals */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-white mb-4">
            Cross-source price signals
          </h2>
          <p className="text-sm text-neutral-400 mb-5 max-w-2xl">
            The Cambridge TCG aggregator holds price data from multiple
            upstream markets. Per-source license tier is declared honestly;
            full history (USD per-condition for TCGplayer, JPY daily for
            CardRush) is signed-in-only per upstream terms.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {signals.map((sig) => (
              <div
                key={sig.source_id}
                className="rounded-lg border border-neutral-800 bg-neutral-900 p-4"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-white font-semibold text-sm">
                    {sig.label}
                  </h3>
                  <span
                    className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border ${
                      sig.available
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : "bg-neutral-700/40 text-neutral-400 border-neutral-700"
                    }`}
                  >
                    {sig.available ? "available" : "pending"}
                  </span>
                </div>
                <p className="text-xs text-neutral-400 mb-3">{sig.detail}</p>
                <div className="flex items-center justify-between text-[10px]">
                  <span className="px-2 py-0.5 rounded bg-neutral-800 text-neutral-400">
                    license: {sig.license}
                  </span>
                  {sig.available && sig.signed_in_path ? (
                    <Link
                      href="/login"
                      className="text-blue-400 hover:underline"
                    >
                      sign in for history →
                    </Link>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-neutral-500 mt-5 max-w-2xl">
            Why signed-in for history? CardRush&apos;s ToS restricts compiled
            price-data redistribution; TCGplayer&apos;s partner agreement
            permits display + computation but not bulk re-export. Cambridge
            TCG honours both upstream terms — anonymous readers see the
            current snapshot; signed-in users see the per-card history
            within the license boundary.
          </p>
        </section>

        {/* Where this card lives */}
        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            About this card
          </h2>
          <dl className="grid gap-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-neutral-500 text-xs uppercase tracking-wider">
                Game
              </dt>
              <dd>
                <Link
                  href={`/prices/${config.slug}`}
                  className={`${accent.text} hover:underline`}
                >
                  {config.display_name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-xs uppercase tracking-wider">
                Set
              </dt>
              <dd>
                <Link
                  href={`/prices/${config.slug}/${setSlug}`}
                  className="text-blue-400 hover:underline"
                >
                  {setCode} {setMeta.name}
                </Link>
              </dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-xs uppercase tracking-wider">
                Card number
              </dt>
              <dd className="font-mono text-neutral-300">{card.card_number}</dd>
            </div>
            <div>
              <dt className="text-neutral-500 text-xs uppercase tracking-wider">
                Canonical SKU
              </dt>
              <dd className="font-mono text-neutral-300 text-xs break-all">
                {card.sku}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-neutral-400 mt-6 max-w-2xl">
            The canonical SKU is the federation-stable identifier — a partner
            with this SKU can resolve through{" "}
            <Link
              href={`/api/v1/universal/card/${card.sku}`}
              className="text-blue-400 hover:underline"
            >
              /api/v1/universal/card/{card.sku}
            </Link>{" "}
            for the math-mirror representation (CC0). Cross-source
            comparison and federation reverse-lookup are documented in{" "}
            <Link
              href="/methodology/cross-source-pricing"
              className="text-blue-400 hover:underline"
            >
              the methodology
            </Link>
            .
          </p>
        </section>
      </main>
    </>
  );
}
