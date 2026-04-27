import type { Metadata } from "next";
import { fetchCard, fetchPrices } from "@/lib/wholesale/client";
import { formatRetailPrice, retailPrice } from "@/lib/pricing";
import { getUnifiedMarketView } from "@/lib/market/unified";
import { formatPrice } from "@/lib/format";
import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import AddToCart from "@/components/cart/AddToCart";
import NotifyMe from "@/components/product/NotifyMe";
import AddToPortfolio from "@/components/product/AddToPortfolio";
import Script from "next/script";

export async function generateMetadata({ params }: { params: Promise<{ sku: string }> }): Promise<Metadata> {
  const { sku } = await params;
  const card = await fetchCard(sku).catch(() => null);
  if (!card) return { title: "Card Not Found — Cambridge TCG" };

  const name = card.name_en || card.name || card.card_number;
  const price = retailPrice(card.price_gbp, card.channel_price);
  const set = card.set_name || card.set_code || "";

  return {
    title: `${name} ${card.card_number} — £${price.toFixed(2)} — Cambridge TCG`,
    description: `Buy ${name} (${card.card_number}) from ${set} for £${price.toFixed(2)}. ${card.stock > 0 ? "In stock" : "Out of stock"}. Near Mint, Japanese. Also available from P2P sellers. We buy this card for store credit. Cambridge TCG — UK's Japanese TCG marketplace.`,
    openGraph: {
      title: `${name} — £${price.toFixed(2)}`,
      description: `${card.card_number} · ${set} · ${card.rarity || ""} · ${card.stock > 0 ? "In Stock" : "Out of Stock"}`,
      images: card.image_url ? [{ url: card.image_url }] : [],
    },
  };
}
import SellForCreditButton from "@/components/product/SellForCreditButton";
import CardGrid from "@/components/catalog/CardGrid";

function rarityBadgeClasses(rarity: string | null): string | null {
  if (!rarity) return null;
  const r = rarity.toUpperCase();
  if (r === "SR" || r === "SEC" || r === "SP" || r === "SCR" || r === "L")
    return "bg-yellow-500/20 text-yellow-400";
  if (r === "R" || r === "RR" || r === "SSR")
    return "bg-purple-500/20 text-purple-400";
  if (r === "UC")
    return "bg-blue-500/20 text-blue-400";
  if (r === "C")
    return "bg-neutral-700 text-neutral-400";
  return null;
}

export default async function ProductPage({ params }: { params: Promise<{ sku: string }> }) {
  const { sku } = await params;
  const card = await fetchCard(sku);
  if (!card) notFound();

  // Fetch related cards from the same set
  const related = card.set_code
    ? await fetchPrices({ set: card.set_code, limit: 7, in_stock: true }).catch(() => ({ items: [] }))
    : { items: [] };
  const relatedCards = related.items.filter((c) => c.sku !== card.sku).slice(0, 6);

  // Fetch P2P market data for this card
  const market = await getUnifiedMarketView(sku).catch(() => null);

  const rarityClasses = rarityBadgeClasses(card.rarity);

  // Determine game slug from set_code pattern
  const gameSlug = "onepiece";
  const cardName = card.name_en || card.name || card.card_number;
  const cardPrice = retailPrice(card.price_gbp, card.channel_price);

  // JSON-LD structured data
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${cardName} ${card.card_number}`,
    description: `${cardName} from ${card.set_name || ""} (${card.card_number}). ${card.rarity || ""} rarity. Japanese, Near Mint.`,
    image: card.image_url || undefined,
    sku: card.sku,
    brand: { "@type": "Brand", name: "One Piece Card Game" },
    category: "Trading Cards",
    offers: {
      "@type": "Offer",
      price: cardPrice.toFixed(2),
      priceCurrency: "GBP",
      availability: card.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      seller: { "@type": "Organization", name: "Cambridge TCG" },
      url: `https://cambridgetcg.com/product/${sku}`,
    },
  };

  return (
    <>
    <Script id="product-jsonld" type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    <div className="max-w-6xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-8">
        <Link href="/" className="hover:text-white transition">Home</Link>
        <span>/</span>
        <Link href={`/catalog?game=${gameSlug}`} className="hover:text-white transition">One Piece</Link>
        {card.set_name && (
          <>
            <span>/</span>
            <Link
              href={`/catalog?game=${gameSlug}&set=${card.set_code}`}
              className="hover:text-white transition"
            >
              {card.set_name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-neutral-400">{card.card_number}</span>
      </nav>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12">
        {/* Card image */}
        <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-neutral-900">
          {card.image_url && (
            <Image
              src={card.image_url}
              alt={card.name_en || card.name || card.card_number}
              fill
              className="object-contain"
              priority
            />
          )}
        </div>

        {/* Card details */}
        <div className="flex flex-col gap-6">
          <div>
            <div className="flex items-center gap-2 text-sm text-neutral-400 uppercase tracking-wider">
              <span>{card.set_name}</span>
              {card.rarity && rarityClasses && (
                <span className={`px-2 py-0.5 text-xs font-bold rounded-full normal-case ${rarityClasses}`}>
                  {card.rarity}
                </span>
              )}
            </div>
            <h1 className="text-3xl font-bold mt-1">{card.name_en || card.name}</h1>
            <p className="text-neutral-400 mt-1">{card.card_number}</p>
          </div>

          <div className="text-4xl font-bold text-emerald-400">{formatRetailPrice(card.price_gbp, card.channel_price)}</div>

          {/* Stock indicator */}
          <div className="text-sm">
            {card.stock > 5 ? (
              <span className="text-neutral-400">In Stock · Near Mint · Japanese</span>
            ) : card.stock > 0 ? (
              <span className="text-amber-400">
                ⚠️ Only {card.stock} left · Near Mint · Japanese
              </span>
            ) : (
              <span className="text-red-400">Out of Stock</span>
            )}
          </div>

          {/* Add to cart / Out of stock actions */}
          {card.stock > 0 ? (
            <AddToCart
              card={{
                sku: card.sku,
                name: card.name_en || card.name || card.card_number,
                price: retailPrice(card.price_gbp, card.channel_price),
                image_url: card.image_url,
                set_code: card.set_code,
                card_number: card.card_number,
              }}
            />
          ) : (
            <div className="flex flex-col gap-3">
              <button
                disabled
                className="opacity-50 cursor-not-allowed px-8 py-4 rounded-xl bg-neutral-800 font-bold"
              >
                Out of Stock
              </button>
              <NotifyMe />
            </div>
          )}

          {/* Track in Portfolio */}
          <AddToPortfolio
            sku={card.sku}
            name={card.name_en || card.name || card.card_number}
            cardNumber={card.card_number}
            setCode={card.set_code}
            setName={card.set_name}
            imageUrl={card.image_url}
            rarity={card.rarity}
            price={retailPrice(card.price_gbp, card.channel_price)}
          />

          {/* P2P Market Context */}
          {(() => {
            if (!market) return null;

            // Filter to only P2P asks (exclude house/CTCG asks)
            const p2pAsks = market.asks.filter((a) => !a.is_house);
            const hasBids = market.bids.length > 0;
            const hasP2pAsks = p2pAsks.length > 0;
            const recentTrades24h = market.recent_trades.filter((t) => {
              const tradeTime = new Date(t.created_at).getTime();
              return Date.now() - tradeTime < 24 * 60 * 60 * 1000;
            });
            const hasRecentTrades = recentTrades24h.length > 0;
            const hasActivity = hasBids || hasP2pAsks || hasRecentTrades;

            // CTCG trade-in credit (show even if no P2P activity)
            const hasTradeinCredit = market.tradein_credit != null && market.tradein_credit > 0;

            if (!hasActivity && !hasTradeinCredit) {
              return (
                <Link
                  href={`/market/${sku}`}
                  className="text-sm text-neutral-500 hover:text-white transition"
                >
                  Trade this card P2P &rarr;
                </Link>
              );
            }

            if (!hasActivity && hasTradeinCredit) {
              return (
                <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
                  <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Market</h3>
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 text-xs font-bold rounded-full bg-purple-500/20 text-purple-400">
                      We Buy
                    </span>
                    <div className="text-sm text-neutral-300">
                      We buy this card for{" "}
                      <span className="text-purple-400 font-semibold">{formatPrice(market.tradein_credit!)}</span>{" "}
                      <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1 py-0.5 rounded font-semibold">store credit</span>
                      <span className="text-xs text-neutral-500 ml-1">&mdash; always available, unlimited</span>
                    </div>
                  </div>
                  <SellForCreditButton sku={sku} creditAmount={market.tradein_credit!} cardName={cardName} cardNumber={card.card_number} setCode={card.set_code} imageUrl={card.image_url} />
                  <p className="text-[11px] text-neutral-500">
                    Instant store credit. Can only be used at Cambridge TCG.
                  </p>
                  <Link
                    href={`/market/${sku}`}
                    className="text-sm text-neutral-500 hover:text-white transition"
                  >
                    View full order book &rarr;
                  </Link>
                </div>
              );
            }

            const bestP2pAsk = hasP2pAsks ? parseFloat(p2pAsks[0].price) : null;
            const spotPrice = market.spot_price;
            const p2pBelowStore =
              bestP2pAsk !== null && spotPrice !== null && bestP2pAsk < spotPrice;
            const p2pDiscountPct =
              p2pBelowStore && spotPrice
                ? Math.round(((spotPrice - bestP2pAsk!) / spotPrice) * 100)
                : null;

            return (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3">
                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wider">Market</h3>

                {/* P2P asks below store price */}
                {hasP2pAsks && p2pBelowStore && (
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 text-xs font-bold rounded-full bg-emerald-500/20 text-emerald-400">
                      P2P Available
                    </span>
                    <div className="text-sm text-neutral-300">
                      Also available from sellers:{" "}
                      <span className="text-white font-medium">
                        From {formatPrice(bestP2pAsk!)}
                      </span>{" "}
                      <span className="text-emerald-400">
                        ({p2pDiscountPct}% below our price)
                      </span>
                      {" "}&nbsp;
                      <Link
                        href={`/market/${sku}`}
                        className="text-emerald-400 hover:text-emerald-300 font-medium transition"
                      >
                        View on Market
                      </Link>
                    </div>
                  </div>
                )}

                {/* P2P asks at or above store price (still worth mentioning) */}
                {hasP2pAsks && !p2pBelowStore && (
                  <div className="text-sm text-neutral-400">
                    Also available from sellers from{" "}
                    <span className="text-white font-medium">{formatPrice(bestP2pAsk!)}</span>
                    {" "}&nbsp;
                    <Link
                      href={`/market/${sku}`}
                      className="text-emerald-400 hover:text-emerald-300 font-medium transition"
                    >
                      View on Market
                    </Link>
                  </div>
                )}

                {/* Highest bid (demand signal) */}
                {hasBids && (
                  <div className="text-sm text-neutral-400">
                    Highest buy offer:{" "}
                    <span className="text-white font-medium">{formatPrice(market.best_bid!)}</span>
                    {" "}&nbsp;
                    <Link
                      href={`/market/${sku}`}
                      className="text-amber-400 hover:text-amber-300 font-medium transition"
                    >
                      Sell yours
                    </Link>
                  </div>
                )}

                {/* We buy — instant store credit */}
                {hasTradeinCredit && (
                  <div className="flex items-start gap-2">
                    <span className="shrink-0 mt-0.5 px-2 py-0.5 text-xs font-bold rounded-full bg-purple-500/20 text-purple-400">
                      We Buy
                    </span>
                    <div className="text-sm text-neutral-300 flex flex-col gap-1.5">
                      <span>
                        We buy this card for{" "}
                        <span className="text-purple-400 font-semibold">{formatPrice(market.tradein_credit!)}</span>{" "}
                        <span className="text-[10px] bg-purple-500/20 text-purple-400 px-1 py-0.5 rounded font-semibold">store credit</span>
                        <span className="text-xs text-neutral-500 ml-1">&mdash; always available, unlimited</span>
                      </span>
                      <SellForCreditButton sku={sku} creditAmount={market.tradein_credit!} cardName={cardName} cardNumber={card.card_number} setCode={card.set_code} imageUrl={card.image_url} />
                    </div>
                  </div>
                )}

                {/* Recent trade count */}
                {hasRecentTrades && (
                  <p className="text-sm text-neutral-500">
                    {recentTrades24h.length} P2P trade{recentTrades24h.length !== 1 ? "s" : ""} in the last 24h
                  </p>
                )}

                {/* Always link to full order book */}
                <Link
                  href={`/market/${sku}`}
                  className="text-sm text-neutral-500 hover:text-white transition"
                >
                  View full order book &rarr;
                </Link>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Related cards */}
      {relatedCards.length > 0 && (
        <div className="mt-16">
          <h2 className="text-xl font-bold text-white mb-2">You may also like</h2>
          <p className="text-sm text-neutral-500 mb-4">More cards from {card.set_name}</p>
          <CardGrid cards={relatedCards} />
        </div>
      )}
    </div>
    </>
  );
}
