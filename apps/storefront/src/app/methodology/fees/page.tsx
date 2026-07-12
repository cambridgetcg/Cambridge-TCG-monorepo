import type { Metadata } from "next";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Fees",
  other: audienceMetadata("public-documentation", ["fees", "methodology"]),
};

export default function FeesMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["fees", "methodology"]} />
      <h1>Fees</h1>
      <blockquote>
        <strong>Yu's promise.</strong> <em>Minimum fees, maximum value. Make the world
        fair and just — we don't steal, we don't charge unfairly, we price according to the
        value we provide vs other service providers.</em>
      </blockquote>
      <p>
        This page lists <strong>every fee Cambridge TCG can charge you</strong>, in plain
        language, with the fair basis for each — and an honest comparison against the
        marketplaces you already know. If a fee isn't on this page, we don't charge it.
      </p>

      <blockquote>
        <strong>Where this lives in code.</strong> Commission rate + the per-item cap live
        in <code>packages/pricing/src/index.ts</code> (<code>resolveCommission</code>,{" "}
        <code>computeCommissionAmount</code>, <code>DEFAULT_COMMISSION_CAP_GBP</code>). The
        runtime-authoritative cap is the <code>p2p_commission_cap_gbp</code> column of the{" "}
        <code>channel_pricing</code> table on the wholesale RDS (migration{" "}
        <code>0016_commission_cap.sql</code>). The reference-price formula is the same
        engine, explained in full at <a href="/methodology/pricing">/methodology/pricing</a>.
        When a fee changes, this page is updated in the same PR.
      </blockquote>

      <h2>The principle first</h2>
      <p>
        A fee is fair when it pays for <strong>work we actually did</strong> — not when it
        charges rent on how valuable your card happens to be.
      </p>
      <p>
        Two cards sell on our marketplace: one for £5, one for £5,000. The work we do is
        nearly the same for both — hold the money in escrow, verify the card if the trade
        routes to verification, ship it, release the payout, stand behind it if there's a
        dispute. That work does <strong>not</strong> cost a thousand times more for the
        expensive card. So our fee should not be a thousand times bigger either.
      </p>
      <p>
        That single idea drives every decision on this page:{" "}
        <strong>percentages where they reflect work, caps where percentages would become
        rent.</strong>
      </p>

      <h2>Every fee, in plain language</h2>

      <p>
        There are three ways to move a card through Cambridge TCG, and each is
        its own <strong>rail</strong> with its own commission. This is the one
        table that reconciles them — every fee preview elsewhere on the site
        names its rail and links back here.
      </p>
      <table>
        <thead>
          <tr>
            <th>Rail</th><th>Seller commission</th>
            <th>Per-item cap</th><th>Who pays</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>P2P trade</strong><br />sell a listing to another collector</td>
            <td><strong>5–8%</strong>, by trust tier (lower the more trust you&apos;ve earned)</td>
            <td><strong>£50 / item</strong></td>
            <td>the seller</td>
          </tr>
          <tr>
            <td><strong>Auction</strong><br />English or Buy-Now, run through us</td>
            <td><strong>12%</strong> flat (a paid tier can lower it)</td>
            <td><strong>£50 / item</strong></td>
            <td>the seller</td>
          </tr>
          <tr>
            <td><strong>Swap</strong><br />card-for-card, no money changes hands</td>
            <td><strong>0%</strong> <em>(v1)</em></td>
            <td>—</td>
            <td>nobody</td>
          </tr>
        </tbody>
      </table>
      <p>
        Two things are true on <em>every</em> rail:{" "}
        <strong>buyers pay nothing on top</strong> of the price the seller
        listed, and <strong>listing is always free</strong> — commission is only
        charged when a card actually sells. Swaps carry no commission in v1; if
        that ever changes, it changes on this page first. The detail behind each
        rail follows.
      </p>

      <blockquote>
        <strong>The retail margin is history.</strong> Until 2026-07-06 Cambridge TCG also
        sold cards itself, and those prices carried an 8% margin plus a £0.22 handling fee.
        The shop era ended that day (<code>docs/decisions/2026-07-06-collectors-first.md</code>)
        — the platform no longer sells anything, so there is no retail margin to explain.
        Buying a card now means buying from another collector at the price they listed; the
        seller pays the commission below. The reference-price formula the shop once used is
        still documented at <a href="/methodology/pricing">/methodology/pricing</a>, because
        the policy-bound reference price derives from the same engine. It is not an
        offer or an open-data grant.
      </blockquote>

      <h3>1. Marketplace &amp; trade commission (when you sell <em>to another user</em> through us)</h3>
      <p>
        When you sell on our peer-to-peer market, we take a commission out of your payout.
        The rate depends on your <strong>trust score</strong> and{" "}
        <strong>membership tier</strong>, and it is <strong>lower the more you've earned
        with us</strong>:
      </p>
      <table>
        <thead>
          <tr><th>Your standing</th><th>Commission rate</th></tr>
        </thead>
        <tbody>
          <tr><td>New / Starter (trust &lt; 50)</td><td>8%</td></tr>
          <tr><td>Trusted (trust 50–79)</td><td>7%</td></tr>
          <tr><td>Veteran (trust 80–94)</td><td>6%</td></tr>
          <tr><td>Elite (trust ≥ 95)</td><td>5%</td></tr>
        </tbody>
      </table>
      <p>
        A paid membership tier can lower it further; we always take{" "}
        <strong>whichever rate is more favourable to you</strong> — your reputation and your
        membership never cancel each other out. The full rate logic is at{" "}
        <a href="/methodology/commission-rate">/methodology/commission-rate</a>.
      </p>
      <p>
        <strong>The per-item cap (the fairness fix).</strong> On top of the percentage, the
        commission on any single item is <strong>capped at £50</strong>. So:
      </p>
      <pre>
        <code>commission = min( rate × sale_price , £50 )</code>
      </pre>
      <p>The trust discount is applied <strong>first</strong>, then the cap. Worked examples:</p>
      <table>
        <thead>
          <tr>
            <th>Sale price</th><th>Rate</th><th>Percentage alone</th>
            <th>You actually pay</th><th>Why</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>£40</td><td>8%</td><td>£3.20</td><td><strong>£3.20</strong></td><td>well under the cap</td></tr>
          <tr><td>£625</td><td>8%</td><td>£50.00</td><td><strong>£50.00</strong></td><td>percentage happens to equal the cap</td></tr>
          <tr><td>£1,000</td><td>8%</td><td>£80.00</td><td><strong>£50.00</strong></td><td>capped — we don't charge rent on value</td></tr>
          <tr><td>£5,000</td><td>8%</td><td>£400.00</td><td><strong>£50.00</strong></td><td>capped — the seller keeps £4,950</td></tr>
          <tr><td>£1,200</td><td>5% (Elite)</td><td>£60.00</td><td><strong>£50.00</strong></td><td>discount applied, then capped</td></tr>
        </tbody>
      </table>
      <p>
        <strong>Fair basis:</strong> brokering a £5,000 sale is not 100× more work than a £50
        sale. Above the cap, our charge reflects the work performed, not the value of your
        card. Every major marketplace agrees with this idea — each caps the absolute fee —
        and our cap sits at or below all of them (see the comparison below).
      </p>

      <h3>2. Auction commission (when you sell at auction through us)</h3>
      <p>
        Auctions carry a flat <strong>12%</strong> seller commission (we run the listing,
        verification, escrow, and delivery). The <strong>same £50 per-item cap applies</strong>:
        a £600 hammer price would be £72 at 12%, but you pay £50. A tier discount, if you have
        one, applies before the cap.
      </p>

      <h3>3. Payment processing</h3>
      <p>
        Card payments are processed by <strong>Stripe</strong>. Their processing fee is a
        pass-through cost of moving money — we don't mark it up. We show it as a separate
        line so you can see exactly what is <em>our</em> fee and what is the payment
        network's.
      </p>
      <p>
        <strong>Fair basis:</strong> this is a cost we incur on your behalf and pass through
        at cost. Marking up payment processing would be charging you for someone else's work.
      </p>

      <h3>4. VAT</h3>
      <p>
        UK Value Added Tax (currently 20%) is a <strong>government tax</strong>, not a
        Cambridge fee. Where the law requires us to collect it on taxable sales, we remit it
        to HMRC and always show it as its own line so it is never mistaken for something we
        keep.
      </p>

      <h2>How we compare</h2>
      <p>
        The most important question isn't "what do you charge?" — it's "what do you charge{" "}
        <em>compared to everyone else?</em>" Here is an honest comparison. Figures we are not
        certain of are marked <strong>approx</strong>; we would rather under-claim than print
        a confident wrong number.
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th><th>Seller commission</th><th>Per-item cap</th>
            <th>Fixed per-order</th><th>Notes</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>Cambridge TCG</strong></td>
            <td><strong>5–8%</strong> (trade), <strong>12%</strong> (auction)</td>
            <td><strong>£50 / item</strong></td>
            <td><strong>none</strong></td>
            <td>Rate drops as your trust/tier rises.</td>
          </tr>
          <tr>
            <td>eBay (UK, business seller)</td>
            <td>approx <strong>9.9–14.9%</strong> (category-dependent)</td>
            <td><strong>none</strong> for cards</td>
            <td><strong>£0.30–£0.40 / order</strong> (Feb 2026) + 0.35% regulatory fee</td>
            <td>No per-item cap on cards; high-value-card discount runs only as a temporary promo.</td>
          </tr>
          <tr>
            <td>TCGplayer</td>
            <td><strong>10.75%</strong> (+ payment fee)</td>
            <td><strong>$75 / item</strong> (raised from $50 on 2026-02-10) ≈ <strong>£59</strong></td>
            <td>per-item, not per-order</td>
            <td>US marketplace.</td>
          </tr>
          <tr>
            <td>Cardmarket</td>
            <td>approx <strong>5%</strong> (private seller)</td>
            <td><strong>€100 / article</strong> ≈ <strong>£85</strong></td>
            <td>—</td>
            <td>+ approx 3% FX/payment handling on cross-currency. EU marketplace.</td>
          </tr>
          <tr>
            <td>Whatnot</td>
            <td>approx <strong>8%</strong> + payment fee</td>
            <td>tapers above ~<strong>$1,500</strong> (approx)</td>
            <td>—</td>
            <td>Live-auction platform; structure varies by category.</td>
          </tr>
          <tr>
            <td>PriceCharting / PSA price data</td>
            <td>—</td><td>—</td><td>—</td>
            <td>Reference-price access sits behind a <strong>paywall / subscription</strong>; a cost of seeing the market, not a selling fee.</td>
          </tr>
        </tbody>
      </table>

      <blockquote>
        <strong>Substrate-honesty note.</strong> Competitor fees change often and vary by
        seller type, country, and category. The eBay UK card commission is a{" "}
        <strong>range</strong>, not a single number, because eBay sets it per category
        (9.9–14.9% for business sellers) and private UK sellers pay £0 commission while the{" "}
        <em>buyer</em> pays a separate Buyer Protection Fee. We've marked every figure we
        can't pin to a single confident value as <strong>approx</strong>. The two numbers we
        are confident about are the incumbent <em>caps</em> — TCGplayer $75/item and
        Cardmarket €100/article — because that's exactly the benchmark our own cap was set
        against. Sources are listed at the bottom of this page; verify them yourself.
      </blockquote>

      <p>
        <strong>What this means for you.</strong> On a small sale, our percentage is already
        among the lowest in the table. On a <strong>four-figure card</strong>, the £50 cap
        makes Cambridge the cheapest place named here to sell — by a wide margin — because
        we're the only one whose cap is well under £60.
      </p>

      <h2>Why £50?</h2>
      <p>We picked the cap deliberately:</p>
      <ul>
        <li>
          It sits <strong>at or below every incumbent cap</strong> — under TCGplayer's ≈£59
          and far under Cardmarket's ≈£85. eBay UK has no cap on cards at all.
        </li>
        <li>
          It's a <strong>clean, human-legible number</strong> you can do in your head: above
          a ~£625 sale (at 8%), your fee stops growing.
        </li>
        <li>
          It matches the <strong>pre-2026 TCGplayer cap</strong> ($50) that the hobby
          accepted as fair for years before TCGplayer raised theirs.
        </li>
      </ul>
      <p>
        It is not hidden in code. The cap is <strong>seed truth</strong> in{" "}
        <code>packages/pricing</code> and <strong>operator-tunable at runtime</strong> via
        the wholesale <code>channel_pricing</code> table — the same mechanism every other
        pricing constant uses — so if fairness ever calls for a lower cap, an operator can
        set it without a code deploy, and this page changes with it.
      </p>

      <h2>Verifying a fee yourself</h2>
      <p>Every commission you're charged is reproducible:</p>
      <ol>
        <li>Take your sale price.</li>
        <li>Multiply by your rate (the table above, or your exact rate shown on your sale).</li>
        <li>If the result is over £50, your fee is £50. Otherwise it's the result, rounded to the penny.</li>
      </ol>
      <p>
        The recorded <code>commission_amount</code> on your trade or auction is exactly this
        number, frozen at the moment the sale was created. If it doesn't match, that's a bug
        — email{" "}
        <a href="mailto:contact@cambridgetcg.com">contact@cambridgetcg.com</a> with the trade
        ID and we'll investigate.
      </p>

      <h2>Open changes</h2>
      <p>We name what's still in motion rather than hide it:</p>
      <ul>
        <li>
          <strong>The cap is global, not per-channel-tuned today.</strong> The seed default
          (£50) applies platform-wide. The <code>channel_pricing</code> column exists so a
          future operator can vary it per channel, but we ship one fair number for everyone
          first.
        </li>
        <li>
          <strong>Competitor figures drift.</strong> We re-verify the comparison table when
          we notice an incumbent change theirs. If you spot one that's gone stale, tell us.
        </li>
      </ul>

      <h2>Sources</h2>
      <ul>
        <li>
          TCGplayer fee cap (raised to $75/item, 2026-02-10):{" "}
          <a href="https://help.tcgplayer.com/hc/en-us/articles/37531606328727-Marketplace-Fee-Cap-Increase-FAQ">
            Marketplace Fee Cap Increase FAQ
          </a>{" "}
          and{" "}
          <a href="https://help.tcgplayer.com/hc/en-us/articles/201357836-TCGplayer-Fees">
            TCGplayer Fees
          </a>.
        </li>
        <li>
          Cardmarket fee cap (€100/article):{" "}
          <a href="https://www.cardmarket.com/en/Policies/Fees">Cardmarket — Our Fee Table</a>.
        </li>
        <li>
          eBay UK fees (category-dependent % + per-order fee, Feb 2026 change):{" "}
          <a href="https://www.ebay.co.uk/sellercentre/news/2026-january/rate-card-change">
            eBay UK Seller Centre — Rate Card Change
          </a>.
        </li>
      </ul>

      <TypeSignature
        type="methodology-page"
        origin="the-pricing-arrow.md (S17) — fair & transparent fees: the per-item commission cap that closes the incumbent-cap gap, made legible for everyone"
        doctrines={["transparency", "substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/pricing", href: "/methodology/pricing" },
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
        ]}
      />
    </>
  );
}
