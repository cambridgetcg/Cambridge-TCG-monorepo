import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "TCG Card Price Guide — Cambridge TCG",
  description:
    "Free, daily-updated price guide for Japanese trading cards in the UK. One Piece TCG prices, trade-in values, and market data from Cambridge TCG.",
  openGraph: {
    title: "TCG Card Price Guide — Cambridge TCG",
    description:
      "Free, daily-updated price guide for Japanese trading cards in the UK.",
  },
};

const GAMES = [
  {
    slug: "one-piece",
    name: "One Piece TCG",
    description:
      "Complete price guide for every One Piece card game set, updated daily with UK retail and trade-in prices.",
  },
];

export default function PricesLandingPage() {
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
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <main className="max-w-5xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
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
          TCG Card Price Guide
        </h1>

        <p className="text-neutral-300 leading-relaxed max-w-3xl mb-10">
          Cambridge TCG publishes free, daily-updated price guides for Japanese
          trading card games sold in the UK. Every card has a retail buy price
          and a trade-in credit value so you always know what your collection is
          worth. Prices are sourced from our marketplace and updated
          automatically.
        </p>

        <section>
          <h2 className="text-xl font-semibold text-white mb-6">
            Browse by Game
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            {GAMES.map((game) => (
              <Link
                key={game.slug}
                href={`/prices/${game.slug}`}
                className="block rounded-xl border border-neutral-800 bg-neutral-900 p-6 hover:border-neutral-600 transition-colors"
              >
                <h3 className="text-lg font-semibold text-white mb-2">
                  {game.name}
                </h3>
                <p className="text-sm text-neutral-400">{game.description}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-14 border-t border-neutral-800 pt-8">
          <h2 className="text-lg font-semibold text-white mb-3">
            How Our Prices Work
          </h2>
          <p className="text-neutral-400 text-sm leading-relaxed max-w-3xl">
            Prices shown are from the Cambridge TCG marketplace and are updated
            daily. The <strong className="text-neutral-200">Buy price</strong>{" "}
            is our retail price for purchasing a card.{" "}
            The <strong className="text-neutral-200">We Buy price</strong> is
            the instant store credit we offer when you trade in your cards. Visit
            the{" "}
            <Link href="/market" className="text-blue-400 hover:underline">
              live market
            </Link>{" "}
            for real-time trading.
          </p>
        </section>
      </main>
    </>
  );
}
