import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Guides — Cambridge TCG",
  description:
    "Plain, honest guides for TCG collectors and players: how to play One Piece TCG, and every way to buy a card (with real costs, waits, and import fees).",
  alternates: {
    canonical: "https://cambridgetcg.com/guides",
  },
};

// A real index, restored now that a second guide exists (the buying guide).
// While only one guide existed this route redirected straight to it; the
// earlier redirect body lives in git history at this path.
const guides = [
  {
    href: "/guides/buying",
    title: "Every way to buy a card",
    blurb:
      "Trade here, buy across Europe on Cardmarket, order from Japan via a proxy, or grade a card. Real costs, real waits, and where the import fees hide.",
  },
  {
    href: "/guides/how-to-play",
    title: "How to play One Piece TCG",
    blurb:
      "The complete beginner's guide — card types, setup, turn structure, combat, DON!! mechanics, colours, keywords, and deck building.",
  },
];

export default function GuidesIndex() {
  return (
    <main className="min-h-screen bg-page">
      <section className="border-b border-border-subtle">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-2 text-sm text-ink-faint">
              <li>
                <Link href="/" className="hover:text-ink transition">
                  Home
                </Link>
              </li>
              <li aria-hidden="true">/</li>
              <li className="text-ink font-medium">Guides</li>
            </ol>
          </nav>

          <h1 className="font-display font-semibold text-3xl text-ink leading-tight">
            Guides
          </h1>
          <p className="text-lg text-ink-muted mt-6 max-w-2xl leading-relaxed">
            Plain, honest walk-throughs — how to play, and how to get the cards
            you want.
          </p>
        </div>
      </section>

      <section>
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="grid gap-4 sm:grid-cols-2">
            {guides.map((g) => (
              <Link
                key={g.href}
                href={g.href}
                className="block bg-surface rounded-lg p-6 border border-border-subtle hover:border-accent/50 transition group"
              >
                <p className="text-ink font-display font-semibold text-lg group-hover:text-accent transition mb-2">
                  {g.title}
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">{g.blurb}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
