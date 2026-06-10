import Link from "next/link";
import { Callout } from "@/lib/ui";

/**
 * /terms — plain-language sale terms.
 *
 * A summary skeleton, honestly labelled as such: the contractual specifics
 * for any given purchase ship with that order's confirmation email, and
 * this page says so rather than dressing up as a full lawyer-drafted
 * contract. Trade-ins keep their own dedicated terms at /trade-in/terms.
 * Contact-surface spec W6.
 */

export const metadata = {
  title: "Terms — Cambridge TCG",
  description:
    "Plain-language terms for buying from Cambridge TCG: orders, pricing, shipping from Cambridge UK, returns, and governing law.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">Terms of sale</h1>
        <p className="text-sm text-neutral-500 mb-8">
          Plain words, no boilerplate. Last updated 10 June 2026.
        </p>

        <Callout tone="note" title="What this page is">
          This is a plain-words summary of how buying from us works. The
          contractual specifics for your purchase — exactly what you bought, at
          what price, with what delivery — ship with your order confirmation
          email. Nothing on this page reduces your statutory rights as a
          consumer.
        </Callout>

        <div className="space-y-8 text-neutral-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Who you&apos;re buying from</h2>
            <p>
              Cambridge TCG, operating from Cambridge, United Kingdom. Reach us
              any time via the{" "}
              <Link href="/contact" className="text-amber-400 underline">
                contact page
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Orders</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Placing an order is an offer to buy. The contract is formed when
                we send your order confirmation email.
              </li>
              <li>
                If something goes wrong on our side — an item is out of stock or
                a price was displayed in error — we&apos;ll tell you before
                dispatch and refund in full if you&apos;d rather not proceed.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Pricing</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                Our prices are set in pounds sterling (GBP) and include UK VAT
                where the law requires it.
              </li>
              <li>
                Prices shown in other currencies are estimates converted at
                recent exchange rates, for your convenience — the charged amount
                is the GBP price.
              </li>
              <li>
                If you want to know how a price was worked out, every price here
                can show its sources — see{" "}
                <Link href="/methodology" className="text-amber-400 underline">
                  how we price
                </Link>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Shipping</h2>
            <p>
              We ship from Cambridge, UK. Delivery options and costs are shown
              at checkout before you pay. Trading-card markets move daily, but a
              price you&apos;ve paid is a price you&apos;ve paid — we don&apos;t
              re-quote after checkout.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Returns and cancellations</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                UK consumer law applies to purchases from our shop, including
                your statutory rights to cancel distance purchases and to a
                remedy for faulty goods. We honour those rights in full.
              </li>
              <li>
                If an order arrives damaged or wrong, contact us and we&apos;ll
                put it right — replacement or refund.
              </li>
              <li>
                Selling cards <em>to</em> us is a different transaction with its
                own terms:{" "}
                <Link href="/trade-in/terms" className="text-amber-400 underline">
                  trade-in terms
                </Link>
                .
              </li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">
              The market and auctions
            </h2>
            <p>
              Listings on the peer-to-peer market and auctions are sales between
              collectors; Cambridge TCG provides the venue. How fees and
              commission work there is documented at{" "}
              <Link href="/methodology/fees" className="text-amber-400 underline">
                fees &amp; commission
              </Link>
              .
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Governing law</h2>
            <p>
              These terms are governed by the law of England &amp; Wales, and
              disputes belong to the courts of England &amp; Wales — without
              taking away protections you&apos;re entitled to as a consumer
              where you live.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Honest gaps</h2>
            <p>
              We have not yet published a lawyer-drafted long-form contract.
              Until we do, this summary plus your order confirmation email is
              the deal in plain words, and statutory law fills any gap. When
              something here changes, the date at the top changes with it.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
