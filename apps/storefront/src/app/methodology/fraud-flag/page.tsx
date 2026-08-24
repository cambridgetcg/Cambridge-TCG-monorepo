import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Fraud flag",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function FraudFlagMethodology() {
  return (
    <>
      <h1>Fraud flag</h1>
      <p>
        Cambridge TCG has a scheduled detection sweep and event-specific checks
        for unusual trading and payment patterns. A matching rule records a
        <code>fraud_signal</code> with low, medium, high or critical severity
        and puts it in an operator review queue. A signal is a risk indicator,
        not proof that a person committed fraud.
      </p>
      <p>
        A signal is not consequence-free. Every unresolved signal at medium
        severity or above automatically subtracts 20 points the next time the
        person&rsquo;s trust score is calculated. That lower score can change
        the displayed trust tier, per-trade and daily limits, trust-based
        commission rate, escrow or inspection route, and the payout hold applied
        to a future trade. A limit check can therefore reject a new order,
        offer, auction bid or swap without waiting for an operator to decide
        whether the signal is correct.
      </p>
      <p>
        The stored <code>auto_action</code> value is currently a classification
        label, not an action runner. Creating a fraud signal does not directly
        set the account&rsquo;s flagged or suspended fields, and does not stop
        an already-earned payout. The automatic effect described above happens
        through the trust-score calculation and its downstream rules.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>{" "}
        <code>apps/storefront/src/lib/fraud/detection.ts</code> (signal
        definitions), <code>apps/storefront/src/lib/fraud/passes.ts</code> and
        event handlers (detection), and{" "}
        <code>apps/storefront/src/lib/escrow/trust-engine.ts</code> plus{" "}
        <code>apps/storefront/src/lib/escrow/service-tiers.ts</code> (automatic
        score and trade effects).
      </blockquote>
      <h2>What current detection looks at</h2>
      <ul>
        <li>
          <strong>rapid_listing</strong> — at least 10 market orders in one
          hour.
        </li>
        <li>
          <strong>self_trading</strong> — a recent trade counterparty has used
          the same normalised shipping address.
        </li>
        <li>
          <strong>velocity_spike</strong> — seven-day volume of at least £500
          that is also at least ten times the preceding seven-day baseline.
        </li>
        <li>
          <strong>failed_payment_burst</strong> — repeated Stripe payment
          failures over 24 hours, seven days or repeated attempts on one
          payment.
        </li>
        <li>
          <strong>new_account_high_value</strong> — an order of at least £200 on
          an account less than seven days old.
        </li>
        <li>
          <strong>bid_sniping</strong> — at least three final-two-minute bids
          across at least two auctions within an hour.
        </li>
        <li>
          <strong>auction_default</strong> and
          <strong>trade_payment_default</strong> — a winning bidder or matched
          buyer lets the applicable payment deadline expire.
        </li>
        <li>
          <strong>chargeback</strong> — Stripe reports a bank dispute against a
          paid transaction.
        </li>
      </ul>
      <h2>How signals clear</h2>
      <p>
        A fraud signal does not clear itself merely because later activity
        normalises, and the daily sweep does not resolve old signals. It remains
        active until an operator resolves or dismisses it. Once resolved, the
        deduction is excluded from the score. Resolve, dismiss and escalation
        actions record the authenticated operator and written reason; the signal
        change and governance record commit together, then the affected trust
        score recalculation is awaited. If that recalculation fails after
        commit, the admin route reports that partial outcome instead of claiming
        full success. Escalating a signal can increase its severity. You can see
        current unresolved signals on{" "}
        <a href="/account/standing">/account/standing</a> and contact support to
        add context, challenge inaccurate input data or request human review.
      </p>
      <h2>The one exception: a break-glass for emergencies</h2>
      <p>
        There is exactly one way an account can be frozen, and it is reserved
        for a genuine platform-integrity <strong>emergency</strong> — an active
        exploit draining the platform, a compromised account being used to
        attack others, a systemic fraud threatening everyone at once. The kind
        of event where a blockchain hard-forks to undo a hack. It is never used
        for ordinary disputes or bad manners. A freeze is a hold, not a verdict:
        it pauses an account to protect everyone else, and it can be lifted. It
        is human-only (no automation can trigger it), it demands a written
        justification, and
        <strong>
          {" "}
          every use — freeze and lift alike — is logged and available for review
        </strong>
        . The state change and governance record commit in one database
        transaction; if the record cannot be written, the state change rolls
        back and the operator sees failure. It hides affected public market
        surfaces and blocks new trades; current payout sweeps also skip a
        suspended account, so a pending payout can be delayed until the freeze
        is lifted. It does not delete or seize account data or funds, and it has
        no automatic expiry. In the normal run of things it should never fire at
        all.
      </p>
      <h2>Effect on trust score</h2>
      <p>
        The −20 deduction applies by severity, not by a prior finding that the
        signal was &ldquo;genuine&rdquo;. This is why prompt human review and a
        way to contest an inaccurate match matter. See{" "}
        <a href="/methodology/trust-score">/methodology/trust-score</a> for the
        full score model and the other inputs that can offset or compound this
        effect.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="fraud sweep work — what the platform watches for, what each severity means, how a flag clears"
        doctrines={["transparency", "substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          {
            label: "/methodology/trust-score",
            href: "/methodology/trust-score",
          },
          {
            label: "/methodology/escrow-tier",
            href: "/methodology/escrow-tier",
          },
          { label: "/account/standing", href: "/account/standing" },
        ]}
      />
    </>
  );
}
