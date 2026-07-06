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
        Cambridge TCG computes a <strong>reference price</strong> for every card in the
        catalog. It is <strong>open data, not an offer</strong> — the platform stopped
        selling (and buying) cards on <strong>2026-07-06</strong>{" "}
        (<code>docs/decisions/2026-07-06-collectors-first.md</code>), so no number on this
        page is a price you can transact with us at. Wherever a card page shows{" "}
        <em>spot</em>, it is this reference, labelled as such; the prices you can actually
        trade at are the collectors&rsquo; own bids and asks on the{" "}
        <a href="/market">market</a>.
      </p>
      <p>
        This page explains exactly how the reference number is computed, and — because
        history is history — documents the shop-era channels the same engine once priced.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> The canonical implementation is at{" "}
        <code>packages/pricing/src/index.ts</code> (function <code>computePrice</code>).
        Channel constants are stored in the <code>channel_pricing</code> table on the
        wholesale RDS and edited via the admin Manager page. Daily snapshot cron lives at{" "}
        <code>apps/wholesale/src/lib/price-snapshot.ts</code>. Every price mutation appends
        to <code>card_price_change_log</code>. When the formula changes, this page is
        updated in the same PR.
      </blockquote>

      <h2>The two inputs</h2>
      <p>Every price starts from two numbers captured at the same moment:</p>
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
        This is what one copy of the card costs us before any margin, fee, VAT, or channel
        uplift. It is the same across all channels.
      </p>

      <h2>The channel multipliers</h2>
      <p>
        Each channel has six numbers that say how to translate the wholesale base into that
        channel's price. Since 2026-07-06 only one channel is customer-facing — the{" "}
        <strong>cambridgetcg.com reference price</strong> — and it faces you as a labelled
        reference, not an offer. The remaining channels are documented for the historical
        record and for reproducing old numbers.
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

      <h2>The channels (one live reference; the rest historical)</h2>
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
        recovered them via the price. The cambridgetcg formula survives as the{" "}
        <strong>reference price</strong> — same computation, no longer an offer.
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
        the tests fire and this page is updated in the same PR. The £5.10 above is what you
        see today as the card&rsquo;s labelled reference price.
      </p>

      <h2>Freshness</h2>
      <p>
        Prices are snapshot daily at 02:00 UTC. The catalog you see on a typical visit was
        true at the most recent snapshot. Every price surface on cambridgetcg.com displays
        a small label like <em>"synced from wholesale · 4h ago"</em> next to the price —
        this is the freshness pill, and it tells you exactly when the number you're looking
        at became true.
      </p>
      <p>
        If the snapshot cron fails or hasn't run yet, the pill turns amber. If the wholesale
        source is unavailable entirely, the pill turns red and reads <em>"source unavailable"</em>.
        We do not show stale prices as if they were live.
      </p>

      <h2>What changes a price</h2>
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

      <h2>What does not affect a price</h2>
      <ul>
        <li>Who is looking at it. Every customer sees the same price for the same channel.</li>
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

      <h2>Verifying a price yourself</h2>
      <p>Every price on cambridgetcg.com is reproducible from:</p>
      <ol>
        <li>The CardRush JPY listing you can navigate to from the card detail page.</li>
        <li>The GBP/JPY rate on the snapshot date.</li>
        <li>The cambridgetcg channel constants in the table above.</li>
        <li>The formula above.</li>
      </ol>
      <p>
        If a price doesn't match what this formula would produce — within £0.01 rounding
        tolerance — that's a bug. Email us at{" "}
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
