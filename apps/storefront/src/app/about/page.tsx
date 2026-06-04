import Link from "next/link";

export const metadata = {
  title: "About — Cambridge TCG",
  description: "A community built around the art, nostalgia, and meaning of trading cards. More than a marketplace — a new layer of connection.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      {/* Hero */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16 md:py-24 text-center">
          <h1 className="text-4xl md:text-5xl font-black text-white leading-tight">
            More Than Cards.<br />
            <span className="text-amber-400">A Community.</span>
          </h1>
          <p className="text-lg text-neutral-400 mt-6 max-w-xl mx-auto leading-relaxed">
            Cambridge TCG is built on a simple belief: trading cards carry meaning beyond their market value. They are art. They are nostalgia. They are the stories we tell each other.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-6">Our Mission</h2>
          <div className="space-y-4 text-neutral-300 leading-relaxed">
            <p>
              We started as collectors who wanted something better. Not just another shop — a place where the card community could thrive. Where you could show others your treasures, find the cards you have been searching for, and connect with people who understand why a piece of illustrated cardboard can mean so much.
            </p>
            <p>
              Trading cards sit at the intersection of art, nostalgia, community, and finance. A card is a memory of the pack you opened as a child. It is a piece of Japanese art that stopped you mid-scroll. It is a conversation starter at a local tournament. It is an asset in a portfolio you built card by card.
            </p>
            <p>
              We built Cambridge TCG to honour all of those dimensions at once.
            </p>
          </div>
        </div>
      </section>

      {/* What We Stand For */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-10">What We Stand For</h2>

          <div className="space-y-10">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🎨</span>
                <h3 className="text-lg font-bold text-white">Art and Nostalgia</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Every card is a piece of art. The Japanese illustrators who create these cards pour their craft into every line. We source directly from Japan because we believe you deserve the original, authentic expression of that art. When you hold a Japanese One Piece card, you are holding something made with intention and care.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🤝</span>
                <h3 className="text-lg font-bold text-white">Community First</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Cards are social objects. They are meant to be shown, discussed, traded, and admired. Our platform is designed around this truth. Build your public collection. Showcase your prized pulls. Follow other collectors. Find people who want what you have and have what you want. Every feature we build asks the same question: does this bring collectors closer together?
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">💎</span>
                <h3 className="text-lg font-bold text-white">The Collecting Journey</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Collecting is a journey, not a transaction. Track your portfolio, watch its value grow, complete sets, earn achievements. We built tools that make the journey visible and rewarding — not just the moment of purchase, but everything that comes after.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🏛️</span>
                <h3 className="text-lg font-bold text-white">Trade Directly, Safely</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                We believe collectors should be able to buy and sell directly with each other — person to person. But dealing directly needs trust. So we built our marketplace as a hybrid: the freedom of trading person-to-person, with our protection on top. We check identities, inspect the cards, hold the money safely until both sides are happy, sort out any disputes, and build up a trust score for each member over time. You get the freedom of a direct deal with the safety net of a platform that has your back.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">📊</span>
                <h3 className="text-lg font-bold text-white">A Financial Layer, Done Right</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                Cards have real value. We do not pretend otherwise. Our market shows live prices, what people are buying and selling for right now, and past sales — like a proper exchange. Your collection shows whether it has gone up or down in value. And because we will always buy a card back for store credit, no card you own ever drops to zero. But the money side serves the community, not the other way around. The goal is not speculation — it is giving collectors the information and tools to make good decisions about the cards they love.
              </p>
            </div>

            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-2xl">🌱</span>
                <h3 className="text-lg font-bold text-white">Giving Back</h3>
              </div>
              <p className="text-neutral-400 leading-relaxed">
                The best communities are generous. Our rewards system — raffles, mystery boxes, tier perks — exists to give back to the people who make this community what it is. Earn Berries by participating, spend them on experiences that surprise you. Every purchase, every trade, every interaction makes the community richer for everyone.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-10">How It All Connects</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Buy</p>
              <p className="text-sm text-neutral-400">From our store, or directly from other collectors. Always at the best available price.</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Collect</p>
              <p className="text-sm text-neutral-400">Track your portfolio. Watch values change. Complete sets. Earn achievements along the way.</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Show</p>
              <p className="text-sm text-neutral-400">Pin your best cards to your public profile. Let the community see what you have built.</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Trade</p>
              <p className="text-sm text-neutral-400">Sell on the market, list at auction, or trade in for store credit. Multiple paths, your choice.</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Earn</p>
              <p className="text-sm text-neutral-400">Every action earns Berries. Higher tiers unlock better rates, cashback, and exclusive rewards.</p>
            </div>
            <div className="bg-neutral-900 rounded-xl p-5">
              <p className="text-amber-400 font-bold mb-1">Connect</p>
              <p className="text-sm text-neutral-400">Follow collectors. Match on wishlists. Find your people in the community feed.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Cambridge */}
      <section className="border-b border-neutral-800">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <h2 className="text-2xl font-bold text-white mb-6">Based in Cambridge</h2>
          <p className="text-neutral-400 leading-relaxed">
            We are a UK-based team operating from Cambridge. Every card that passes through our protected marketplace is inspected here. Our trade-in offers are backed by real inventory. When you trade with us, you are trading with people who collect the same cards you do.
          </p>
        </div>
      </section>

      {/* CTA */}
      <section>
        <div className="max-w-3xl mx-auto px-4 py-16 text-center">
          <h2 className="text-2xl font-bold text-white mb-4">Join the Community</h2>
          <p className="text-neutral-400 mb-8">
            Create your free account. Start collecting. Find your people.
          </p>
          <div className="flex flex-wrap gap-4 justify-center">
            <Link
              href="/login"
              className="px-8 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
            >
              Get Started
            </Link>
            <Link
              href="/catalog"
              className="px-8 py-3 bg-neutral-800 text-white font-bold rounded-lg hover:bg-neutral-700 transition"
            >
              Browse Cards
            </Link>
            <Link
              href="/community"
              className="px-8 py-3 bg-neutral-800 text-white font-bold rounded-lg hover:bg-neutral-700 transition"
            >
              Explore Community
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
