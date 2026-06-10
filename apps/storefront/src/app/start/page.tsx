import Link from "next/link";

export const metadata = {
  title: "Start Here — Cambridge TCG",
  description:
    "New here? In plain words: what this is, what you can do, and what it costs. No jargon.",
};

const THINGS_YOU_CAN_DO = [
  {
    emoji: "🛒",
    label: "Buy a card",
    href: "/catalog",
    note: "Browse our shop, or buy straight from other collectors.",
  },
  {
    emoji: "💱",
    label: "Sell or trade your cards",
    href: "/market",
    note: "List on the market, run an auction, or trade in for credit.",
  },
  {
    emoji: "🎴",
    label: "Learn to play",
    href: "/play",
    note: "Start a game in about five minutes — no account, no forms.",
  },
  {
    emoji: "📚",
    label: "Just looking, or learning",
    href: "/guides",
    note: "Plain-language guides. Nothing assumed.",
  },
];

export default function StartPage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <section className="max-w-2xl mx-auto px-4 py-16">
        <h1 className="text-3xl md:text-4xl font-black">New here?</h1>
        <p className="text-lg text-neutral-300 mt-4 leading-relaxed">
          Cambridge TCG is a simple, fair place to{" "}
          <strong>buy, sell, trade, and play</strong> with trading cards. That is
          the whole thing. No jargon below — promise.
        </p>

        <h2 className="text-xl font-bold mt-12 mb-4">What do you want to do?</h2>
        <ul className="space-y-3">
          {THINGS_YOU_CAN_DO.map((d) => (
            <li key={d.href}>
              <Link
                href={d.href}
                className="block bg-neutral-900 rounded-xl p-4 hover:bg-neutral-800 transition"
              >
                <span className="font-bold text-amber-400">
                  {d.emoji} {d.label}
                </span>
                <span className="block text-sm text-neutral-400 mt-1">{d.note}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="text-sm text-neutral-500 mt-4">
          Want doors picked for who you are?{" "}
          <Link href="/welcome" className="text-amber-400 underline">
            Tell us, and we&apos;ll point the way
          </Link>
          .
        </p>

        <h2 id="fees" className="text-xl font-bold mt-12 mb-4">
          What does it cost?
        </h2>
        <div className="space-y-3 text-neutral-300 leading-relaxed">
          <p>
            <strong className="text-emerald-400">
              Trading with other people: 0% commission (<Link href="/methodology/fees" className="text-amber-400 underline">how fees work</Link>).
            </strong>{" "}
            We do not take a cut when you trade card-for-card or sell to another
            collector.
            <span className="text-neutral-500">
              {" "}
              (Marketplaces like TCGplayer and eBay usually take around 10–13%.)
            </span>
          </p>
          <p>
            <strong className="text-white">Buying from our shop:</strong> a small
            margin (about 8%) over what the card costs us, plus UK VAT where the
            law requires it. That is how we keep the lights on — nothing hidden.
          </p>
          <p>
            <strong className="text-white">No surprise fees.</strong> Every price
            can show you how it was worked out. If a number affects you, you can
            always ask <em>why</em>.{" "}
            <Link href="/methodology" className="text-amber-400 underline">
              See how we price.
            </Link>
          </p>
          <p className="text-sm text-neutral-500">
            Other companies&apos; rates above are approximate and as publicly
            published — check their current terms. Our own numbers come straight
            from our pricing engine.
          </p>
        </div>

        <h2 className="text-xl font-bold mt-12 mb-4">Built for everyone</h2>
        <p className="text-neutral-300 leading-relaxed">
          This page is plain HTML — it works with a screen reader, on a slow
          connection, and for an AI agent shopping on your behalf. Everything here
          is also available as plain data at{" "}
          <Link href="/manifest" className="text-amber-400 underline">
            /manifest
          </Link>
          . You never need an account just to look around.
        </p>

        <div className="mt-12 flex flex-wrap gap-3">
          <Link
            href="/catalog"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Browse cards
          </Link>
          <Link
            href="/play"
            className="px-6 py-3 bg-neutral-800 text-white font-bold rounded-lg hover:bg-neutral-700 transition"
          >
            Try playing
          </Link>
          <Link
            href="/about"
            className="px-6 py-3 text-neutral-300 font-bold rounded-lg hover:text-white transition"
          >
            About us
          </Link>
        </div>
      </section>
    </main>
  );
}
