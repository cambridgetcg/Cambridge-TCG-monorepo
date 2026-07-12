/**
 * /trade-in — the we-buy desk, kept as one honest page.
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md):
 * the trade-in desk closed on 2026-07-06 having received zero
 * submissions and owing zero credit — nothing stranded. The buylist,
 * quote funnel, bundle/bulk/custom-quote forms all collapsed into
 * this page. It says plainly what trade-in was, that the platform no
 * longer buys, and where collectors actually sell now. The old
 * sub-routes redirect here so no bookmark meets a 404.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Trade-in has closed — sell to collectors instead — Cambridge TCG",
  description:
    "Cambridge TCG no longer buys cards. Sell to collectors on the peer-to-peer market: list an ask, take a buy offer, or propose a swap.",
  other: audienceMetadata("consumer", ["seller"]),
};

export default function TradeInPage() {
  return (
    <main className="min-h-screen bg-page">
      <Audience kind="consumer" contexts={["seller"]} />
      <div className="max-w-2xl mx-auto px-4 py-20">
        <h1 className="text-3xl font-display font-semibold text-ink">
          The trade-in desk has closed
        </h1>
        <p className="text-ink-muted mt-4">
          Trade-in was Cambridge TCG buying cards from you — for store credit or
          cash, against a daily buylist. On 6 July 2026 the platform stopped
          buying and selling altogether and became a pure collectors&apos; market.
          No trade-in was ever left unpaid and no store credit was stranded;
          the desk closed owing nothing.
        </p>
        <p className="text-ink-muted mt-3">
          Selling works better now: instead of one buyer (us) quoting you a
          buylist price, you name your price to every collector on the market —
          with the same escrow protection buyers get.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <div className="bg-surface border border-border-subtle rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-ink font-bold">List cards for sale</h2>
              <p className="text-ink-muted text-sm mt-1">
                Set your ask and let collectors come to you. You can also take a
                standing buy offer for an instant sale.
              </p>
            </div>
            <Link
              href="/market/list"
              className="mt-4 inline-block px-5 py-2.5 bg-ink text-page text-sm font-bold rounded-lg hover:opacity-90 transition text-center"
            >
              List on the market
            </Link>
          </div>
          <div className="bg-surface border border-border-subtle rounded-lg p-5 flex flex-col justify-between">
            <div>
              <h2 className="text-ink font-bold">Swap instead of sell</h2>
              <p className="text-ink-muted text-sm mt-1">
                Trade cards directly with another collector — no money needs to
                move at all.
              </p>
            </div>
            <Link
              href="/account/swaps/new"
              className="mt-4 inline-block px-5 py-2.5 border border-border-subtle text-ink text-sm font-medium rounded-lg hover:border-border-strong transition text-center"
            >
              Propose a swap
            </Link>
          </div>
        </div>

        <p className="text-sm text-ink-faint mt-8">
          Not sure what your cards are worth? The{" "}
          <Link href="/prices" className="text-accent hover:text-accent-strong transition">
            price guide
          </Link>{" "}
          shows publicly viewable reference prices, and every card&apos;s page on the{" "}
          <Link href="/market" className="text-accent hover:text-accent-strong transition">
            market
          </Link>{" "}
          shows current collector bids and asks. Reuse of reference data follows
          the source rights declared by its API response.
        </p>
      </div>
    </main>
  );
}
