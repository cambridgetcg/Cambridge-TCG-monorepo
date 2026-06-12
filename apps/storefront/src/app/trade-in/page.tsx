import { Audience, audienceMetadata } from "@/lib/ui";
import Link from "next/link";

// The trade-in desk closed on 2026-06-11 (regulator pivot, kingdom-101).
// The platform regulates the market and holds no position in it — it no
// longer buys cards, for credit or cash. Sellers liquidate to other
// participants on the market. This page survives as the honest record of
// the closure and the door for in-flight submissions.

export const metadata = {
  title: "Trade-In Desk Closed — Cambridge TCG",
  description:
    "Cambridge TCG no longer buys cards. The platform regulates the market and never trades in it. Sell your cards to other collectors on the P2P market.",
  other: audienceMetadata("consumer", ["seller"]),
};

export default function TradeInClosedPage() {
  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-16">
        <Audience kind="consumer" contexts={["seller"]} />
        <h1 className="text-3xl font-bold text-white mb-4">The trade-in desk is closed</h1>
        <p className="text-neutral-300 leading-relaxed mb-4">
          As of June 2026, Cambridge TCG no longer buys cards — for store
          credit or cash. The platform runs the market and does not trade in
          it: no house offers, no house bids, no desk. Our revenue is the
          commission on trades between participants, never a spread of our
          own. The full commitment is written at{" "}
          <Link href="/methodology/regulator" className="text-amber-500 hover:underline">
            /methodology/regulator
          </Link>
          .
        </p>
        <p className="text-neutral-300 leading-relaxed mb-8">
          Selling your cards now happens on the open market, to other
          collectors — list at your price, protected by escrow and the
          reputation system, or run an auction.
        </p>
        <div className="flex flex-wrap gap-3 mb-12">
          <Link
            href="/market"
            className="px-5 py-2.5 bg-amber-500 text-neutral-950 font-bold rounded-lg hover:bg-amber-400 transition text-sm"
          >
            Sell on the Market
          </Link>
          <Link
            href="/auctions"
            className="px-5 py-2.5 bg-neutral-900 border border-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-800 transition text-sm"
          >
            List at Auction
          </Link>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-5">
          <h2 className="text-sm font-bold text-white mb-2">
            Already sent us cards?
          </h2>
          <p className="text-sm text-neutral-400 leading-relaxed">
            Every submission made before the desk closed will be honored in
            full — grading, quoted prices, and payouts proceed as promised.
            Your confirmation and quote reference links still work, and your
            history stays at{" "}
            <Link href="/account/trade-ins" className="text-amber-500 hover:underline">
              /account/trade-ins
            </Link>
            . The{" "}
            <Link href="/trade-in/terms" className="text-amber-500 hover:underline">
              trade-in terms
            </Link>{" "}
            remain published for those submissions.
          </p>
        </div>
      </div>
    </div>
  );
}
