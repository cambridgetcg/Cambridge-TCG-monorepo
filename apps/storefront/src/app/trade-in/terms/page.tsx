import Link from "next/link";

export const metadata = {
  title: "Trade-In Terms — Cambridge TCG",
  description: "Terms and conditions for trading in your cards with Cambridge TCG.",
};

export default function TradeInTermsPage() {
  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/trade-in" className="text-sm text-neutral-400 hover:text-white transition mb-6 inline-block">
          ← Back to Trade-In
        </Link>

        <h1 className="text-2xl md:text-3xl font-bold text-white mb-8">Trade-In Terms &amp; Conditions</h1>

        <div className="prose prose-invert max-w-none space-y-8 text-neutral-300 text-sm leading-relaxed">
          <section>
            <h2 className="text-lg font-bold text-white mb-3">Payout Rates</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-purple-400">Store Credit:</strong> Up to <strong>100% of market value</strong>. Store credit can only be used to purchase from Cambridge TCG.</li>
              <li><strong className="text-emerald-400">Cash:</strong> Up to <strong>85% of market value</strong>, paid via bank transfer.</li>
              <li><strong className="text-amber-400">MINT Bonus (+20%):</strong> Cards in perfect MINT condition (pack-fresh, zero imperfections) may qualify for an additional <strong>20% bonus</strong> on top of the base payout. The MINT bonus is discretionary and subject to the evaluation and sole decision of Cambridge TCG. It is not guaranteed and may vary per card.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Bulk Card Trade-In</h2>
            <ul className="list-disc pl-5 space-y-2">
              <li><strong className="text-emerald-400">Base rate:</strong> <strong>2p per card</strong> for all Common (C), Uncommon (UC), and Rare (R) cards. No sorting required — just count and send.</li>
              <li><strong className="text-amber-400">Valuable finds:</strong> If we identify cards in your bulk that are worth significantly more than 2p (tournament staples, alt art rares, valuable uncommons), we will pay <strong>85% of market value</strong> for those cards instead of the base rate. This amount is credited separately on top of your base payout.</li>
              <li>Minimum submission: <strong>50 cards</strong>.</li>
              <li>Bulk payouts are issued in <strong>store credit</strong>.</li>
              <li>Cards should be in playable condition (no heavily damaged or water-damaged cards).</li>
              <li>The identification and valuation of any &quot;gems&quot; within your bulk is at the sole discretion of Cambridge TCG.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Card Condition</h2>
            <p>
              All cards submitted should be in <strong>Near Mint (NM)</strong> or better condition. This means
              cards should have no visible wear, scratches, whitening on edges, creases, or bends.
              Cards that do not meet NM standards may be graded lower, resulting in a reduced payout,
              or returned at the customer&apos;s expense.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Pricing &amp; Volatility</h2>
            <p>
              Trade-in prices are refreshed daily based on current market conditions. However, trading card markets are volatile and prices can change significantly even within the same day. The prices shown on the buylist are indicative and subject to change at the point of quotation.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Price Lock Guarantee</h2>
            <p>
              Prices shown on the buylist are indicative. Once your trade-in has been <strong>manually reviewed and a formal quotation issued</strong> by Cambridge TCG, the quoted prices are <strong>locked for 24 hours</strong> from the date of quotation. Your cards must arrive within this 24-hour window for the quoted prices to be honoured. After 24 hours, the quotation expires and prices may be re-evaluated based on current market rates.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Shipping</h2>
            <p>
              Customers are responsible for shipping costs when sending cards to us. We recommend
              using a tracked and insured delivery service. Cambridge TCG is not responsible for
              cards lost or damaged in transit.
            </p>
            <p className="mt-2">
              For trade-ins with a total payout of <strong>£100 or more</strong>, we will contribute
              <strong> £2.70</strong> towards your shipping costs, added to your final payout.
            </p>
            <p className="mt-2">Ship your cards to:</p>
            <div className="bg-neutral-900 rounded-lg p-4 mt-2 not-prose">
              <p className="text-white text-sm">Cambridge TCG</p>
              <p className="text-white text-sm">PO Box 1637</p>
              <p className="text-white text-sm">CAMBRIDGE</p>
              <p className="text-white text-sm">CB1 0PD</p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Payment</h2>
            <p>Two payment options are available:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li><strong>Store Credit:</strong> Processed within 1 business day after grading. Credit is applied to your account and can be used for any purchase on cambridgetcg.com.</li>
              <li><strong>Cash (Bank Transfer):</strong> Processed within 2 business days after grading. Funds are sent via bank transfer to the account details you provide.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Cancellation</h2>
            <p>
              You may cancel your trade-in submission at any time before your cards have been received
              and processed by contacting us at{" "}
              <a href="mailto:contact@cambridgetcg.com" className="text-amber-400 hover:underline">
                contact@cambridgetcg.com
              </a>{" "}
              with your reference number.
            </p>
            <p className="mt-2">
              Once cards have been received and grading has begun, cancellation is no longer possible.
              Cards that have been graded but not yet paid out may be returned at the customer&apos;s
              expense upon request.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Age Requirement</h2>
            <p>
              You must be <strong>18 years of age or over</strong> to submit a trade-in. By submitting
              a trade-in request, you confirm that you meet this requirement.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Record Keeping</h2>
            <p>
              Cambridge TCG maintains records of all trade-in transactions in accordance with UK
              regulations. Records include customer details, card details, quantities, and payment
              information. This data is retained for a minimum of 6 years for accounting and legal
              compliance purposes.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-white mb-3">Contact</h2>
            <p>
              For questions about trade-ins, contact us at{" "}
              <a href="mailto:contact@cambridgetcg.com" className="text-amber-400 hover:underline">
                contact@cambridgetcg.com
              </a>
              .
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
