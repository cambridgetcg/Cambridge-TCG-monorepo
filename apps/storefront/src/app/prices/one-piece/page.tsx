import type { Metadata } from "next";
import Link from "next/link";
import { fetchPrices, fetchSets } from "@/lib/wholesale/client";
import { retailPrice } from "@/lib/pricing";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "One Piece TCG Price Guide UK — Updated Daily",
  description:
    "Complete One Piece card prices in the UK. Every set, every card — updated daily with retail buy prices and trade-in credit values. Free price guide from Cambridge TCG.",
  openGraph: {
    title: "One Piece TCG Price Guide UK — Updated Daily",
    description:
      "Complete One Piece card prices in the UK. Every set, every card — updated daily.",
  },
};

/* ------------------------------------------------------------------ */
/*  Rarity badge (server-safe)                                         */
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

export default async function OnePiecePriceGuidePage() {
  // Fetch sets and top cards in parallel
  const [sets, topCardsData, tradeinData] = await Promise.all([
    fetchSets("one-piece").catch(() => []),
    fetchPrices({
      game: "one-piece",
      sort: "price_desc",
      limit: 20,
    }).catch(() => ({ items: [], total: 0 })),
    fetchPrices({
      game: "one-piece",
      sort: "price_desc",
      limit: 20,
      channel: "tradein-credit",
    }).catch(() => ({ items: [] })),
  ]);

  // Build trade-in lookup
  const tradeinMap = new Map<string, number>();
  for (const item of tradeinData.items) {
    if (item.channel_price && item.channel_price > 0) {
      tradeinMap.set(item.sku, item.channel_price);
    }
  }

  const topCards = topCardsData.items.map((item) => ({
    sku: item.sku,
    name: item.name_en || item.name || item.card_number,
    card_number: item.card_number,
    set_code: item.set_code,
    set_name: item.set_name,
    rarity: item.rarity,
    price: retailPrice(item.price_gbp, item.channel_price),
    tradein_credit: tradeinMap.get(item.sku) ?? null,
  }));

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
        name: "One Piece TCG",
        item: "https://cambridgetcg.com/prices/one-piece",
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
            <li className="text-white">One Piece TCG</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-bold text-white mb-4">
          One Piece TCG Price Guide UK — Updated Daily
        </h1>

        <p className="text-neutral-300 leading-relaxed max-w-3xl mb-10">
          This is a complete, daily-updated price guide for every One Piece
          Trading Card Game set available in the UK. Each card lists a retail buy
          price and a trade-in store credit value. Prices are sourced from the
          Cambridge TCG marketplace. Use this guide to check card values, plan
          trades, or compare prices before buying or selling.
        </p>

        {/* ---------------------------------------------------------- */}
        {/*  All Sets                                                    */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-5">
            All One Piece TCG Sets
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sets.map((set) => (
              <Link
                key={set.code}
                href={`/prices/one-piece/${set.code.toLowerCase()}`}
                className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3 hover:border-neutral-600 transition-colors"
              >
                <div>
                  <span className="text-white font-medium text-sm">
                    {set.code}
                  </span>
                  <span className="text-neutral-400 text-sm ml-2">
                    {set.name}
                  </span>
                </div>
                <span className="text-neutral-500 text-xs">
                  {set.card_count} cards
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Top 20 Most Valuable Cards                                  */}
        {/* ---------------------------------------------------------- */}
        <section className="mb-14">
          <h2 className="text-xl font-semibold text-white mb-5">
            Top 20 Most Valuable One Piece Cards
          </h2>

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
                {topCards.map((card, i) => (
                  <tr
                    key={card.sku}
                    className="bg-neutral-900 hover:bg-neutral-800/60 transition-colors"
                  >
                    <td className="px-3 py-3 text-neutral-500 font-medium">
                      {i + 1}
                    </td>
                    <td className="px-3 py-3">
                      <Link
                        href={`/product/${card.sku}`}
                        className="text-white hover:text-blue-400 transition-colors"
                      >
                        {card.name}
                      </Link>
                      <span className="text-neutral-500 text-xs ml-2">
                        {card.card_number}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-neutral-400">
                      {card.set_code}
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------- */}
        {/*  Pricing explanation                                         */}
        {/* ---------------------------------------------------------- */}
        <section className="border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            How Prices Are Calculated
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl mb-4">
            Prices shown are from the Cambridge TCG marketplace and are updated
            daily. The <strong className="text-neutral-200">Buy Price</strong>{" "}
            is our retail price — the cost to purchase a card from stock.{" "}
            The <strong className="text-neutral-200">We Buy</strong> price is
            the instant store credit we offer when you trade in your cards. All
            prices are in GBP.
          </p>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl">
            Want to buy or sell cards live?{" "}
            <Link href="/market" className="text-blue-400 hover:underline">
              Visit the Cambridge TCG Market
            </Link>{" "}
            for real-time peer-to-peer trading, bid/ask orders, and instant
            checkout.
          </p>
        </section>
      </main>
    </>
  );
}
