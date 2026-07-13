/**
 * /product/[sku] — the card's reference page.
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md): the
 * platform no longer sells. This page keeps the card's identity — art,
 * set, rarity, a labelled, policy-bound reference price (never an offer
 * or open-data grant) —
 * and points the one strong CTA at the collectors' market, where the
 * card actually trades. Add-to-cart, stock counts, and the we-buy desk
 * died with the shop; portfolio tracking and browsing survive.
 */

import type { Metadata } from "next";
import { fetchCard, fetchPrices, cardAltText } from "@/lib/wholesale/client";
import { formatRetailPrice } from "@/lib/pricing";
import { getUnifiedMarketView } from "@/lib/market/unified";
import { MoneyDisplay } from "@/lib/ui";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import AddToPortfolio from "@/components/product/AddToPortfolio";
import ExternalBuyLinks from "@/components/product/ExternalBuyLinks";
import AnsweringRhyme from "@/components/product/AnsweringRhyme";
import Script from "next/script";
import CardGrid from "@/components/catalog/CardGrid";
import { Provenance, WhyLink, Audience, Palettes } from "@/lib/ui";
import { TONE_COLOR } from "@/lib/ui/Badge";
import { gameFromSku, gameBrand, isSkuGameSlug } from "@/lib/games/sku-game";
import { getPriceGuideConfig } from "@/lib/prices/games-config";
import { weatherClass } from "@/lib/wardrobe/weather";
import { deriveCardWallText } from "@/lib/culture/exhibition-notes";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const { sku } = await params;
  const card = await fetchCard(sku).catch(() => null);
  if (!card) return { title: "Card Not Found — Cambridge TCG" };

  const name = card.name_en || card.name || card.card_number;
  const set = card.set_name || card.set_code || "";

  return {
    title: `${name} ${card.card_number} — Card Reference — Cambridge TCG`,
    description: `${name} (${card.card_number}) from ${set}. Reference price, market activity, and live collector listings on the Cambridge TCG collectors' market. Public card data with response-specific reuse rights.`,
    openGraph: {
      title: `${name} ${card.card_number}`,
      description: `${card.card_number} · ${set} · ${card.rarity || ""} · trade it on the collectors' market`,
      images: card.image_url ? [{ url: card.image_url }] : [],
    },
  };
}

function rarityBadgeClasses(rarity: string | null): string | null {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  if (r === "SR" || r === "SEC" || r === "SP" || r === "SCR" || r === "L")
    return "bg-warning/20 text-warning";
  if (r === "R" || r === "RR" || r === "SSR")
    return "bg-[#6a5a8f]/15 text-[#6a5a8f]";
  if (r === "UC")
    return "bg-info/20 text-info";
  if (r === "C")
    return "bg-surface-subtle text-ink-muted";
  return null;
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const card = await fetchCard(sku);
  if (!card) notFound();

  // Fetch related cards from the same set
  const related = card.set_code
    ? await fetchPrices({ set: card.set_code, limit: 7 }).catch(() => ({ items: [] }))
    : { items: [] };
  const relatedCards = related.items.filter((c) => c.sku !== card.sku).slice(0, 6);

  // Collector market pulse for this card (asks/bids/tape only — the
  // platform holds no position, so nothing here is ours to sell or buy)
  const market = await getUnifiedMarketView(sku).catch(() => null);

  const rarityClasses = rarityBadgeClasses(card.rarity);

  // Derive the game from the SKU via the shared @/lib/games/sku-game map
  // (one truth: it handles both production's legacy prefix-typed SKUs
  // like PK-SV2A-011-JP and canonical <game>-<set>-<number>-<lang>
  // SKUs). The old canonical-only parse yielded "pk" which matched no
  // game_code, so every pokemon/dragon-ball page silently wore the One
  // Piece breadcrumb and brand. Underivable SKUs (SEALED-, unknown
  // prefixes) fall back to One Piece, the catalog's founding game.
  const gameSlug = gameFromSku(card.sku) ?? "one-piece";
  const gameConfig = getPriceGuideConfig(gameSlug) ?? null;
  const gameLabel = gameConfig?.short_name ?? "One Piece";
  const brandName = gameBrand(gameSlug);
  const cardName = card.name_en || card.name || card.card_number;

  // The card's wall text — one reverent line composed ONLY from real fields
  // (rarity in plain words + the set it belongs to). Labelled on the surface
  // as an editorial reading; never invented lore. (Release year is on the
  // set, not the card, so it is omitted here — the honest minimum.)
  const wallText = deriveCardWallText(card);

  // JSON-LD structured data — Product identity WITHOUT an Offer block.
  // The platform sells nothing, so schema.org must not claim a
  // first-party sale; collector listings live at /market/[sku].
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName} ${card.card_number}`,
    description: `${cardName} from ${card.set_name || ""} (${card.card_number}). ${card.rarity || ""} rarity. Japanese. Reference data and collector listings at Cambridge TCG.`,
    image: card.image_url || undefined,
    sku: card.sku,
    brand: { "@type": "Brand", name: brandName },
    category: "Trading Cards",
    url: `https://cambridgetcg.com/product/${sku}`,
  };

  const bestAsk = market && market.asks.length > 0 ? parseFloat(market.asks[0].price) : null;
  const bestBid = market?.best_bid ?? null;
  const recentTrades24h = market
    ? market.recent_trades.filter((t) => {
        const tradeTime = new Date(t.created_at).getTime();
        return Date.now() - tradeTime < 24 * 60 * 60 * 1000;
      })
    : [];
  const hasPulse = bestAsk !== null || bestBid !== null || recentTrades24h.length > 0;

  return (
    <>
    <Script id="product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <Audience kind="consumer" contexts={["product-detail"]} />
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-ink-faint mb-8">
        <Link href="/" className="hover:text-ink transition">Home</Link>
        <span>/</span>
        <Link href={`/catalog?game=${gameSlug}`} className="hover:text-ink transition">{gameLabel}</Link>
        {card.set_name && (
          <>
            <span>/</span>
            <Link
              href={`/catalog?game=${gameSlug}&set=${card.set_code}`}
              className="hover:text-ink transition"
            >
              {card.set_name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-ink-muted">{card.card_number}</span>
      </nav>

      {/* The game weather follows the derivable game only — a SEALED- box
          keeps the breadcrumb's one-piece fallback but wears no sky it
          can't honestly claim (spec 2026-07-07 §4). */}
      <div className={`grid grid-cols-1 md:grid-cols-5 gap-8 md:gap-14 items-start ${weatherClass(gameFromSku(card.sku))}`}>
        {/* The work — given room, mounted on a museum mat. The art is the
            only saturated thing on the page; the mat is its quiet board. */}
        <div className="md:col-span-3">
          <div className="bg-mat rounded-xl p-4 sm:p-8 md:p-10 shadow-mat">
            <div
              className="wardrobe-aura"
              style={{ "--aura": TONE_COLOR[Palettes.RarityPalette[card.rarity ?? ""] ?? "neutral"] } as React.CSSProperties}
            >
              <div className="relative aspect-[3/4] wardrobe-panel overflow-hidden">
                {card.image_url && (
                  <Image
                    src={card.image_url}
                    alt={cardAltText(card)}
                    fill
                    className="object-contain"
                    priority
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The placard — the two museum voices: set/number/rarity in the
            mono apparatus voice, the title in Fraunces, the reading in
            Fraunces italic. */}
        <div className="md:col-span-2 flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint">{card.set_name}</span>
              {card.rarity && rarityClasses && (
                <span className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full uppercase tracking-wider ${rarityClasses}`}>
                  {card.rarity}
                </span>
              )}
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-semibold text-ink mt-2 leading-tight">{cardName}</h1>
            <p className="font-mono text-sm text-ink-muted mt-1">{card.card_number}</p>

            {/* The wall text — derived from the card's own facts, shown as a
                labelled reading (never presented as upstream lore). */}
            {wallText && (
              <div className="mt-5 border-l-2 border-border-subtle pl-4">
                <p className="font-placard italic text-ink-muted leading-relaxed">{wallText}</p>
                <p className="text-[10px] uppercase tracking-[0.15em] text-ink-faint mt-1.5">
                  A reading · from the card&apos;s own facts
                </p>
              </div>
            )}
          </div>

          {/* Policy-bound reference price — labelled, never an offer or reuse grant */}
          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-muted uppercase tracking-wider">Reference price</span>
            <div className="text-4xl font-display font-semibold text-ink">{formatRetailPrice(card.price_gbp, card.channel_price)}</div>
            <div className="flex items-center gap-3">
              <Provenance kind="synced" source="wholesale" at={card.updated_at} cadence="daily" />
              <WhyLink href="/methodology/pricing" />
            </div>
            <p className="text-xs text-ink-faint">
              A published data point, not an offer — Cambridge TCG doesn&apos;t buy or sell cards.
              What this card actually trades for is set by collectors on the market.
            </p>
          </div>

          {/* Primary CTA — the market is where this card lives now */}
          <Link
            href={`/market/${sku}`}
            className="inline-flex items-center justify-center px-8 py-4 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition text-lg"
          >
            View on the collectors&apos; market &rarr;
          </Link>

          {/* Track in Portfolio */}
          <AddToPortfolio
            sku={card.sku}
            name={card.name_en || card.name || card.card_number}
            cardNumber={card.card_number}
            setCode={card.set_code}
            setName={card.set_name}
            imageUrl={card.image_url}
            rarity={card.rarity}
          />

          {/* Collector market pulse */}
          {hasPulse ? (
            <div className="bg-surface border border-border-subtle rounded-lg p-4 flex flex-col gap-3">
              <h3 className="font-mono text-xs font-semibold text-ink-muted uppercase tracking-[0.15em]">On the market · the card&apos;s ledger</h3>
              {bestAsk !== null && (
                <div className="text-sm text-ink-muted">
                  Collectors are selling from{" "}
                  <MoneyDisplay value={bestAsk} className="text-ask font-medium" />
                  {" "}&nbsp;
                  <Link
                    href={`/market/${sku}`}
                    className="text-accent hover:text-accent-strong font-medium transition"
                  >
                    See listings
                  </Link>
                </div>
              )}
              {bestBid !== null && (
                <div className="text-sm text-ink-muted">
                  Highest buy offer:{" "}
                  <MoneyDisplay value={bestBid} className="text-bid font-medium" />
                  {" "}&nbsp;
                  <Link
                    href={`/market/${sku}`}
                    className="text-accent hover:text-accent-strong font-medium transition"
                  >
                    Sell yours
                  </Link>
                </div>
              )}
              {recentTrades24h.length > 0 && (
                <p className="text-sm text-ink-faint">
                  {recentTrades24h.length} collector trade{recentTrades24h.length !== 1 ? "s" : ""} in the last 24h
                </p>
              )}
              <Link
                href={`/market/${sku}`}
                className="text-sm text-ink-faint hover:text-ink transition"
              >
                View full order book &rarr;
              </Link>
            </div>
          ) : (
            <p className="text-sm text-ink-faint">
              No live listings for this card yet —{" "}
              <Link
                href={`/market/${sku}`}
                className="text-accent hover:text-accent-strong transition"
              >
                be the first to list it
              </Link>
              , or{" "}
              <Link
                href="/account/swaps/new"
                className="text-accent hover:text-accent-strong transition"
              >
                propose a swap
              </Link>
              .
            </p>
          )}

          {/* Find this card elsewhere — routes outward to the other channels
              (CardRush/Cardmarket/eBay). Sits below the market CTA so the
              collectors' market stays the primary door; the guide at
              /guides/buying explains each channel's cost, wait and fees. */}
          {/* Buy-links exist for the confirmed trio only; other games'
              SKUs (Atlas-wide resolution) simply skip the strip rather
              than borrow One Piece's channels. */}
          {isSkuGameSlug(gameSlug) && (
            <ExternalBuyLinks card={card} gameSlug={gameSlug} />
          )}
        </div>
      </div>

      {/* A relation appears only when the bounded, human-reviewable corpus
          has one for this exact SKU. It keeps interpretation, evidence, and
          each object's rights visible instead of inferring influence. */}
      <AnsweringRhyme sku={card.sku} />

      {/* Related cards */}
      {relatedCards.length > 0 && (
        <div className="mt-16">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-ink-faint mb-1">More from this exhibition</p>
          <h2 className="text-xl font-display font-semibold text-ink mb-4">{card.set_name}</h2>
          <CardGrid cards={relatedCards} />
        </div>
      )}
    </div>
    </>
  );
}
