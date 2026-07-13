import type { Metadata } from "next";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Pricing",
  other: audienceMetadata("public-documentation", ["pricing", "methodology"]),
};

export default function PricingMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["pricing", "methodology"]} />
      <h1>Pricing</h1>
      <p>
        Cambridge TCG stores legacy wholesale observations and derived channel values,
        but it does <strong>not publish those price magnitudes today</strong>. The rows
        predate field-level source-rights receipts. Public card surfaces return null for
        legacy prices and images, and price-history routes return status without values.
        Authentication and mathematical transformation do not reopen that boundary.
      </p>
      <p>
        Public visibility does not grant redistribution or training rights. API
        consumers must inspect the response license and source-rights fields.
      </p>
      <p>
        This page documents the internal and shop-era formula so its existence is
        understandable. It is not evidence that any computed value is publicly available.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The canonical implementation is at{" "}
        <code>packages/pricing/src/index.ts</code> (function <code>computePrice</code>).
        Channel constants and observations remain internal on the wholesale substrate.
        The public boundary is enforced in the wholesale price routes and storefront
        field-withholding helpers. Formula tests do not grant publication rights.
      </blockquote>

      <h2>The two inputs</h2>
      <p>
        The dormant/internal calculation starts from two inputs captured at the same
        moment. The method is public; the underlying observations and results are not.
      </p>
      <ul>
        <li>
          <strong>JPY listing price</strong> — what the card is listed at on CardRush, in
          Japanese yen. Read once a day, then frozen for 24 hours.
        </li>
        <li>
          <strong>GBP/JPY rate</strong> — our view of the exchange rate at the moment of
          capture. Stored alongside the JPY value, so that the rate used to compute today's
          prices is the rate we wrote them with — not the rate at the moment you happen to
          be reading.
        </li>
      </ul>
      <p>From these two, we derive a third — the <strong>wholesale base</strong>:</p>
      <pre>
        <code>baseGbp = cardrush_jpy / gbp_jpy_rate</code>
      </pre>
      <p>
        This was the shop-era internal base before margin, fee, VAT, or channel uplift.
      </p>

      <h2>The channel multipliers</h2>
      <p>
        Each channel has six numbers that translate the internal wholesale base into a
        derived value. No derived legacy card value is customer-facing today. The channels
        remain documented for code review and the historical record.
      </p>
      <table>
        <thead>
          <tr>
            <th>Number</th>
            <th>What it is</th>
            <th>Example (cambridgetcg.com)</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><code>marginMultiplier</code></td>
            <td>Our gross-margin uplift. 1.08 = 8% on top of base.</td>
            <td>1.08</td>
          </tr>
          <tr>
            <td><code>flatFeeSingles</code></td>
            <td>Per-card flat fee for single cards.</td>
            <td>£0.22</td>
          </tr>
          <tr>
            <td><code>flatFeeSealed</code></td>
            <td>Per-product flat fee for sealed product.</td>
            <td>£2.20</td>
          </tr>
          <tr>
            <td><code>vatMultiplier</code></td>
            <td>UK VAT multiplier. 1.20 = 20%.</td>
            <td>1.20</td>
          </tr>
          <tr>
            <td><code>retailMultiplier</code></td>
            <td>Channel-specific retail uplift.</td>
            <td>1.15</td>
          </tr>
          <tr>
            <td><code>roundTo</code></td>
            <td>Final rounding step.</td>
            <td>£0.10</td>
          </tr>
        </tbody>
      </table>

      <p>The full formula:</p>
      <pre>
        <code>
{`exVat    = (baseGbp × marginMultiplier + flatFee) × retailMultiplier
vat      = exVat × (vatMultiplier - 1)
preRound = exVat + vat
price    = round(preRound / roundTo) × roundTo`}
        </code>
      </pre>
      <p>
        The final <code>round</code> uses banker's-style nearest-rounding (JavaScript's{" "}
        <code>Math.round</code>); a preRound value of £5.14 with a <code>roundTo</code> of{" "}
        £0.10 yields £5.10, not £5.20.
      </p>

      <h2>The channels (internal or historical; none publicly priced)</h2>
      <table>
        <thead>
          <tr>
            <th>Channel</th>
            <th>Margin ×</th>
            <th>Flat singles</th>
            <th>VAT ×</th>
            <th>Retail ×</th>
            <th>Round</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>wholesale</strong> (B2B base)</td><td>1.08</td><td>£0.22</td><td>1.20</td><td>1.00</td><td>£0.01</td></tr>
          <tr><td><strong>cambridgetcg.com</strong> (Next.js)</td><td>1.08</td><td>£0.22</td><td>1.20</td><td>1.15</td><td>£0.10</td></tr>
          <tr><td><strong>Shopify</strong></td><td>1.08</td><td>£0.22</td><td>1.20</td><td>1.15</td><td>£0.10</td></tr>
          <tr><td><strong>eBay</strong></td><td>1.08</td><td>£0.22</td><td>1.20</td><td>1.25</td><td>£0.10</td></tr>
          <tr><td><strong>Cardmarket</strong></td><td>1.08</td><td>£0.22</td><td>1.20</td><td>1.20</td><td>£0.01</td></tr>
          <tr><td><strong>Trade-in (cash)</strong></td><td>0.55</td><td>£0</td><td>1.00</td><td>1.00</td><td>£0.01</td></tr>
          <tr><td><strong>Trade-in (store credit)</strong></td><td>0.77</td><td>£0</td><td>1.00</td><td>1.00</td><td>£0.01</td></tr>
        </tbody>
      </table>

      <p>
        The <strong>trade-in channels</strong> (historical) inverted the margin: the shop
        paid 55% of the wholesale base for cash, 77% for store credit, with no flat fee, no
        VAT, and no retail uplift. The we-buy desk closed 2026-07-06 — zero trade-ins were
        ever submitted — so these rows price nothing now; they are kept so old numbers stay
        reproducible.
      </p>
      <p>
        The <strong>retail channels</strong> (historical: Shopify, eBay, Cardmarket; and the
        shop-era cambridgetcg price) all charged VAT. The retail multiplier differed per
        channel: eBay's was highest because eBay's seller fees were higher and the shop
        recovered them via the price. The cambridgetcg formula remains in code and
        internal records; its result is not emitted as a public reference value.
      </p>

      <h2>Worked example</h2>
      <p>A ¥600 listing today (¥/£ rate = 185):</p>
      <pre>
        <code>
{`baseGbp = 600 / 185 = £3.24

cambridgetcg.com:
  exVat    = (3.24 × 1.08 + 0.22) × 1.15  = £4.28
  vat      = 4.28 × 0.20                  = £0.86
  preRound = 4.28 + 0.86                  = £5.14
  price    = round(5.14 / 0.10) × 0.10    = £5.10`}
        </code>
      </pre>
      <p>
        The same listing priced £5.60 on eBay, £1.78 on trade-in cash, and £2.50 on trade-in
        credit in the shop era. These exact numbers are locked as regression tests in{" "}
        <code>packages/pricing/src/__tests__/pricing.test.ts</code> — if the formula drifts,
        the tests fire. The £5.10 above is a worked formula example, not a value published
        for a current card.
      </p>

      <h2>Freshness</h2>
      <p>
        Internal collection jobs may retain observations and timestamps. Public structural
        catalog freshness describes the returned structural row, not a published price.
        No freshness label should be read as permission to disclose a withheld magnitude.
      </p>
      <p>
        A null public price is the source-rights boundary, not a claim that the value is
        zero, stale, or temporarily unavailable.
      </p>

      <h2>What changes an internal stored value</h2>
      <ol>
        <li>
          <strong>The daily snapshot found a new CardRush price.</strong> Most common. The cron
          at 02:00 UTC scrapes CardRush, pairs it with the current exchange rate, runs the
          formula, and writes a new row. Logged with <code>action = "snapshot"</code>.
        </li>
        <li>
          <strong>An admin edited the price manually.</strong> Rare. Logged with{" "}
          <code>action = "admin_edit"</code> and the operator's email.
        </li>
        <li>
          <strong>The CSV upload sync ran.</strong> Bulk imports through the admin CSV path
          produce the same effect as a daily snapshot for the affected cards.
        </li>
        <li>
          <strong>The exchange rate moved overnight.</strong> Even if the JPY price is
          unchanged, a different rate produces a different GBP base.
        </li>
      </ol>

      <h2>What does not affect the internal formula</h2>
      <ul>
        <li>Who is looking at it. The public boundary withholds the legacy value for everyone.</li>
        <li>Stock level. Low-stock cards do not auto-mark-up; high-stock cards do not auto-discount.</li>
        <li>
          Account standing or trust score. These affect{" "}
          <a href="/methodology/commission-rate">commission</a> and{" "}
          <a href="/methodology/escrow-tier">escrow routing</a>, not the retail price.
        </li>
        <li>
          Membership tier. Tier perks include cashback and points multipliers; the listed
          price is the same regardless of tier (your cashback / points adjustment lands
          separately).
        </li>
      </ul>

      <h2>Verifying the documented formula</h2>
      <p>The formula can be reproduced from hypothetical or independently licensed inputs:</p>
      <ol>
        <li>A JPY input you have the right to use; public card pages do not expose the stored CardRush value.</li>
        <li>The GBP/JPY rate on the snapshot date.</li>
        <li>The cambridgetcg channel constants in the table above.</li>
        <li>The formula above.</li>
      </ol>
      <p>
        If the pure formula does not match its documented worked examples within £0.01
        rounding tolerance, that is a code or documentation bug. Email us at{" "}
        <a href="mailto:contact@cambridgetcg.com">contact@cambridgetcg.com</a>{" "}
        with the SKU and the snapshot date and we'll investigate.
      </p>

      <h2>Open changes</h2>
      <p>Some pricing aspects are still in motion. We name them rather than hide them:</p>
      <ul>
        <li>
          <strong>Vault sell-back values are frozen at acquisition.</strong> When you redeem
          a bounty pull into your vault, the sell-back-to-store-credit price is locked at
          that moment's spot. If the market moves, your frozen value does not move with it.
          This is intentional today; we may revisit.
        </li>
        <li>
          <strong>Channel parity is operator-set, not algorithmic.</strong> The
          eBay-vs-cambridgetcg-vs-Shopify multiplier difference is policy, not derived.
        </li>
      </ul>
    

      <TypeSignature
        type="methodology-page"
        origin="the-pricing-arrow.md (S17) — the seven transformations from ¥600 in a CardRush listing to £5.40 on a customer's screen"
        doctrines={["substrate-honesty", "transparency", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "the-pricing-arrow.md (S17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pricing-arrow.md" },
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/store-credit", href: "/methodology/store-credit" },
        ]}
      />
    </>
  );
}
