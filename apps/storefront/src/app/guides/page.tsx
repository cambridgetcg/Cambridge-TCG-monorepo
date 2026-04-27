import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Guides — Cambridge TCG",
  description:
    "Learn how to play One Piece TCG, build competitive decks, and master game strategy. Free guides from Cambridge TCG.",
  openGraph: {
    title: "Guides — Cambridge TCG",
    description:
      "Learn how to play One Piece TCG, build competitive decks, and master game strategy.",
    type: "website",
  },
};

const guides = [
  {
    title: "How to Play One Piece TCG",
    description:
      "Complete beginner's guide. Card types, turn structure, attacking, DON!! mechanics, colours, keywords, and deck building basics.",
    href: "/guides/how-to-play",
    tag: "Beginner",
    tagColor: "bg-emerald-500/20 text-emerald-400",
  },
];

export default function GuidesIndex() {
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
        name: "Guides",
        item: "https://cambridgetcg.com/guides",
      },
    ],
  };

  return (
    <main className="min-h-screen bg-neutral-950">
      <Script
        id="guides-breadcrumb-jsonld"
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      {/* Hero */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center justify-center gap-2 text-sm text-neutral-500">
              <li>
                <Link href="/" className="hover:text-white transition">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-white font-medium">Guides</li>
            </ol>
          </nav>

          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">
            Learn the Game.
            <br />
            <span className="text-amber-400">Master the Cards.</span>
          </h1>
          <p className="text-lg text-neutral-400 mt-6 max-w-xl mx-auto leading-relaxed">
            Free guides to help you learn One Piece TCG from scratch, build your
            first deck, and start winning.
          </p>
        </div>
      </section>

      {/* Guide list */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="space-y-4">
            {guides.map((guide) => (
              <Link key={guide.href} href={guide.href} className="block group">
                <div className="bg-neutral-900 rounded-xl p-6 border border-neutral-800 group-hover:border-neutral-700 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h2 className="text-lg font-bold text-white group-hover:text-amber-400 transition">
                          {guide.title}
                        </h2>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${guide.tagColor}`}
                        >
                          {guide.tag}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-400 leading-relaxed">
                        {guide.description}
                      </p>
                    </div>
                    <span className="shrink-0 text-neutral-600 group-hover:text-amber-400 transition text-xl">
                      &rarr;
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
