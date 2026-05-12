import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Payout hold",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function PayoutHoldMethodology() {
  return (
    <>
      <h1>Payout hold</h1>
      <p>
        When you sell something on Cambridge TCG, the buyer's payment is held briefly before
        it is released to you. The duration depends on <strong>what kind of sale it was</strong>{" "}
        and, for P2P trades, <strong>your trust tier at the moment the trade was created</strong>.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>
        <ul>
          <li>Trust tier table: <code>apps/storefront/src/lib/escrow/types.ts</code> (<code>TRUST_TIERS</code>).</li>
          <li>Trade hold-days column: <code>market_trades.payout_hold_days</code>, stamped at trade-creation.</li>
          <li>Auction hold: flat 3 days, applied by the maintenance cron.</li>
          <li>Available_at calculation surfaced on <a href="/account/payouts">/account/payouts</a>.</li>
        </ul>
      </blockquote>

      <h2>What "hold" means</h2>
      <p>A hold is the gap between two events:</p>
      <ol>
        <li>
          The buyer pays. (For trades: when escrow reaches <code>completed</code>. For
          auctions: when <code>auction.status = 'paid'</code>.)
        </li>
        <li>The seller's payout becomes eligible to send.</li>
      </ol>
      <p>
        During the hold, the payout is <em>recorded</em> on the platform (visible on{" "}
        <a href="/account/payouts">/account/payouts</a> as scheduled) but not yet sent. The
        hold gives the buyer time to raise a dispute before the funds leave the platform.
      </p>

      <h2>P2P trades — by seller's trust tier</h2>
      <p>
        The hold is determined by the seller's tier <em>at the moment the trade was created</em>,
        not at completion. This locks the hold to the conditions both parties agreed to up
        front.
      </p>
      <table>
        <thead>
          <tr>
            <th>Tier</th><th>Min trust score</th><th>Payout hold</th><th>Reason</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>New</strong></td><td>0</td><td>7 days</td><td>First-time sellers; longest dispute window</td></tr>
          <tr><td><strong>Starter</strong></td><td>20</td><td>5 days</td><td>Some history, still building reputation</td></tr>
          <tr><td><strong>Trusted</strong></td><td>50</td><td>3 days</td><td>Demonstrated reliability</td></tr>
          <tr><td><strong>Veteran</strong></td><td>80</td><td>1 day</td><td>Established sellers; near-instant turnaround</td></tr>
          <tr><td><strong>Elite</strong></td><td>95</td><td>0 days</td><td>Released as soon as escrow completes</td></tr>
        </tbody>
      </table>
      <p>
        The tier itself is a function of your trust score; see{" "}
        <a href="/methodology/trust-score">/methodology/trust-score</a>. If you're disputing
        your hold duration, the appeal lives at the inputs to your trust score — not at the
        hold itself.
      </p>

      <h2>Auctions — flat 3 days</h2>
      <p>
        Auctions use a single 3-day hold for <strong>every</strong> seller, regardless of tier.
        The reasoning: auctions are higher-variance than P2P trades (rare cards, sniping
        protections that already extend the close); the auction-seller pool is small enough
        that per-tier tuning hasn't been load-bearing; and 3 days matches the Trusted tier on
        P2P, which is roughly the median seller.
      </p>

      <h2>Worked examples</h2>
      <p><strong>Trade — Trusted seller.</strong></p>
      <p>
        Trade created at 14:00 UTC. <code>payout_hold_days = 3</code>. Buyer pays; escrow
        completes at 09:30 UTC three days later. Available_at = completion + 3 days. The cron
        sweep releases the payout at that moment.
      </p>
      <p><strong>Trade — Elite seller.</strong></p>
      <p>
        Same trade, Elite seller. <code>payout_hold_days = 0</code>. Available_at = completion
        itself. Released as soon as escrow completes.
      </p>
      <p><strong>Auction — any seller.</strong></p>
      <p>
        Buyer pays at 11:00 UTC. <code>auction.status = 'paid'</code>. Available_at = paid_at +
        3 days. Released then.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="payout-tracking + sweep work — how long a seller's funds wait after a sale before becoming withdrawable"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/trust-score", href: "/methodology/trust-score" },
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
        ]}
      />
    </>
  );
}
