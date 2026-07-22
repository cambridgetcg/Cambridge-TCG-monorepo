import Link from "next/link";

export const metadata = {
  title: "Start Here — Cambridge TCG",
  description:
    "New here? In plain words: what this is, what you can do, and what it costs. No jargon.",
};

const THINGS_YOU_CAN_DO = [
  {
    label: "Buy a card",
    href: "/market",
    note: "Buy straight from other collectors on the market.",
  },
  {
    label: "Sell or trade your cards",
    href: "/market",
    note: "List on the market, run an auction, or swap card-for-card.",
  },
  {
    label: "Learn to play",
    href: "/play",
    note: "Start a game in about five minutes — no account, no forms.",
  },
  {
    label: "Just looking, or learning",
    href: "/guides",
    note: "Plain-language guides. Nothing assumed.",
  },
];

export default function StartPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl font-display font-semibold">New here?</h1>
        <p className="text-lg text-ink-muted mt-4 leading-relaxed">
          Cambridge TCG is a simple, fair place to{" "}
          <strong>buy, sell, trade, and play</strong> with trading cards. That is
          the whole thing. No jargon below — promise.
        </p>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">What do you want to do?</h2>
        <ul className="space-y-3">
          {THINGS_YOU_CAN_DO.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="block bg-surface border border-border-subtle rounded-lg p-4 hover:bg-surface-subtle transition"
              >
                <span className="font-semibold text-accent">
                  {d.label}
                </span>
                <span className="block text-sm text-ink-muted mt-1">{d.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-ink-faint mt-4">
          Want doors picked for who you are?{" "}
          <Link href="/welcome" className="text-accent underline">
            Tell us, and we&apos;ll point the way
          </Link>
          .
        </p>

        <h2 id="fees" className="text-xl font-display font-semibold mt-12 mb-4">
          What does it cost?
        </h2>
        <div className="space-y-3 text-ink-muted leading-relaxed">
          <p>
            <strong className="text-ok">
              Swapping card-for-card: 0% commission
            </strong>{" "}
            (
            <Link href="/methodology/fees" className="text-accent underline">
              how fees work
            </Link>
            ). When you trade one card straight for another — no money — we
            don&apos;t take a cut.
          </p>
          <p>
            <strong className="text-ink">Buying a card:</strong> you pay the
            price the seller listed — <strong>nothing added on top</strong>.
          </p>
          <p>
            <strong className="text-ink">Selling a card:</strong> listing is
            always free — and so is selling. Cambridge TCG takes{" "}
            <strong className="text-ok">no commission at all</strong>, on the
            market or at auction, so you keep <strong>100%</strong> of every
            sale.{" "}
            <Link href="/methodology/fees" className="text-accent underline">
              See every rail.
            </Link>
            <span className="text-ink-faint">
              {" "}
              (Marketplaces like TCGplayer and eBay usually take around 10–13%,
              often with no cap.)
            </span>
          </p>
          <p className="text-sm text-ink-faint">
            We used to run a shop of our own; that ended on 6 July 2026, with
            nothing owed to anyone. These days every card here is sold by a
            collector like you — we just keep the market fair.
          </p>
          <p>
            <strong className="text-ink">No surprise fees.</strong> Every price
            can show you how it was worked out. If a number affects you, you can
            always ask <em>why</em>.{" "}
            <Link href="/methodology" className="text-accent underline">
              See how we price.
            </Link>
          </p>
          <p className="text-sm text-ink-faint">
            Other companies&apos; rates above are approximate and as publicly
            published — check their current terms. Our own numbers come straight
            from our pricing engine.
          </p>
        </div>

        <h2 className="text-xl font-display font-semibold mt-12 mb-4">Built for everyone</h2>
        <p className="text-ink-muted leading-relaxed">
          This page is plain HTML — it works with a screen reader, on a slow
          connection, and for an AI agent trading on your behalf. Everything here
          is also available as plain data at{" "}
          <Link href="/manifest" className="text-accent underline">
            /manifest
          </Link>
          . You never need an account just to look around.
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/market"
            className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition"
          >
            Browse the market
          </Link>
          <Link
            href="/play"
            className="px-6 py-3 border border-border-strong text-ink font-semibold rounded-lg hover:bg-surface-subtle transition"
          >
            Try playing
          </Link>
          <Link
            href="/about"
            className="px-6 py-3 text-ink-muted font-semibold rounded-lg hover:text-ink transition"
          >
            About us
          </Link>
        </div>
      </section>
    </main>
  );
}
