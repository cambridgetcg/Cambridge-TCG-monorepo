import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Trust score",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function TrustScoreMethodology() {
  return (
    <>
      <h1>Trust score</h1>
      <p>
        The trust score is a single number, 0–100, that summarises your track record on
        Cambridge TCG. It influences your <strong>trade limits</strong> (per-trade and daily),
        your <strong>escrow tier</strong> (Direct, Verified, Full), whether{" "}
        <strong>escrow inspection</strong> is required, and your <strong>payout hold days</strong>.
      </p>
      <p>
        The score is computed by code, not by humans, against data the platform has already
        collected about your behavior. You can see your own score and its components on{" "}
        <a href="/account/standing">/account/standing</a>. This page documents the formula.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The canonical implementation is at{" "}
        <code>apps/storefront/src/lib/escrow/trust-engine.ts</code> (function{" "}
        <code>calculateTrustScore</code>). When the formula changes, this page is updated in the
        same PR.
      </blockquote>

      <h2>Components (positive — up to 100 points)</h2>

      <h3>1. Trade completion rate — up to 30 points</h3>
      <p>
        The fraction of your trades that ended with <code>escrow_status = completed</code>,
        scaled to 30. A user with 9 of 10 trades completed gets 27 points; 10 of 10 gets the
        full 30. Cancelled and disputed trades count <em>against</em> completion (in the
        denominator but not the numerator). New users with zero trades get 0 here — the score
        grows as you trade.
      </p>

      <h3>2. Review score — up to 25 points</h3>
      <p>
        Average rating across reviews you've received as a counterparty, scaled to 25 (so a
        5-star average yields the full 25, a 3-star average yields 15).
      </p>
      <p>
        <strong>Reviewer-trust weighting.</strong> Each review's contribution is multiplied by
        a weight depending on the reviewer's <em>own</em> trust score:
      </p>
      <table>
        <thead>
          <tr><th>Reviewer's trust</th><th>Weight</th></tr>
        </thead>
        <tbody>
          <tr><td>≥ 80 (Veteran/Elite)</td><td>1.0</td></tr>
          <tr><td>≥ 50 (Trusted)</td><td>0.8</td></tr>
          <tr><td>≥ 20 (Starter)</td><td>0.6</td></tr>
          <tr><td>&lt; 20 (New)</td><td>0.4</td></tr>
        </tbody>
      </table>
      <p>
        This is anti-farming. A 5-star from a Veteran counts more than a 5-star from a
        brand-new account. The effective weight is persisted on each review row so you can
        see — on <a href="/account/reviews">/account/reviews</a> — exactly how much each
        review counted.
      </p>

      <h3>3. Trade volume — up to 15 points</h3>
      <p>
        Logarithmic. Total cumulative volume (in £) is taken as <code>log10(total) × 5</code>,
        capped at 15. £100 → 10 points; £1,000 → 15; £10,000 → also 15 (capped). The log scale
        is deliberate — going from £0 to £100 matters more than going from £10,000 to £20,000.
        Trust accrues with experience, not deal size.
      </p>

      <h3>4. Account age — up to 10 points</h3>
      <p>
        Months since your <em>first</em> trade, capped at 5 months for the maximum 10 points
        (2 points per month). Tracks experience-on-the-platform, not calendar age. A user who
        registered a year ago but only started trading last week is still "new."
      </p>

      <h3>5. Verification — up to 10 points</h3>
      <p>
        Either 0 or 10. UK-verified (full KYC: legal name, address, phone, bank verified) →
        10. Unverified → 0. Binary by design.
      </p>

      <h3>6. External reputation — up to 10 points</h3>
      <p>
        5 points per verified cross-platform reputation entry, capped at 10. Linking and
        verifying your eBay or CardMarket account contributes here.
      </p>

      <h2>Penalties (subtracted from the positive total)</h2>
      <table>
        <thead>
          <tr><th>Trigger</th><th>Penalty</th></tr>
        </thead>
        <tbody>
          <tr><td>Active dispute (open)</td><td>−10 per open dispute</td></tr>
          <tr><td>Dispute lost (resolved against you)</td><td>−15 per lost dispute</td></tr>
          <tr><td>Dispute resolved as split</td><td>−8 per split (half-credit)</td></tr>
          <tr><td>Unresolved fraud signal of medium severity or higher</td><td>−20 per signal</td></tr>
        </tbody>
      </table>
      <p>
        Penalties stack. <strong>Win/loss attribution depends on role.</strong> If you were the
        seller and the dispute resolved as <code>release_seller</code>, you won. If it resolved
        as <code>refund_buyer</code> or <code>return_card</code>, you lost. The <code>split</code>{" "}
        outcome credits half a loss to both sides.
      </p>

      <h2>Final score and tiers</h2>
      <pre><code>{`raw_score   = completion + review + volume + age + verification + external_rep
final_score = max(0, min(100, raw_score - penalties))`}</code></pre>
      <p>The final score is mapped to a tier, which determines limits and routing:</p>
      <table>
        <thead>
          <tr>
            <th>Tier</th><th>Min score</th><th>Trade limit</th><th>Daily limit</th>
            <th>Inspection?</th><th>Payout hold</th>
          </tr>
        </thead>
        <tbody>
          <tr><td><strong>New</strong></td><td>0</td><td>£50</td><td>£100</td><td>yes</td><td>7 days</td></tr>
          <tr><td><strong>Starter</strong></td><td>20</td><td>£150</td><td>£500</td><td>yes</td><td>5 days</td></tr>
          <tr><td><strong>Trusted</strong></td><td>50</td><td>£500</td><td>£2,000</td><td>no</td><td>3 days</td></tr>
          <tr><td><strong>Veteran</strong></td><td>80</td><td>£2,000</td><td>£10,000</td><td>no</td><td>1 day</td></tr>
          <tr><td><strong>Elite</strong></td><td>95</td><td>£10,000</td><td>£50,000</td><td>no</td><td>0 days</td></tr>
        </tbody>
      </table>
      <p>
        Tier table source: <code>apps/storefront/src/lib/escrow/types.ts</code> (
        <code>TRUST_TIERS</code>).
      </p>

      <h2>Recompute cadence</h2>
      <p>Your trust score is recomputed automatically when:</p>
      <ul>
        <li>A trade you're part of completes, cancels, or is disputed.</li>
        <li>A review of you is submitted, hidden, or restored.</li>
        <li>A fraud signal against you is raised or resolved.</li>
        <li>An external reputation entry is verified or removed.</li>
        <li>The maintenance sweep runs (every minute) — drains pending recomputes.</li>
      </ul>
      <p>
        The maintenance cron lives at <code>apps/storefront/src/app/api/cron/maintenance</code>{" "}
        and dispatches the recompute via{" "}
        <code>apps/storefront/src/lib/escrow/trust-recompute.ts</code>. The{" "}
        <code>trust_profiles.last_calculated_at</code> column tracks the most recent recompute.
      </p>

      <h2>Disputing your score</h2>
      <p>
        There is no "appeal the score itself" — the score is a function of inputs, so the
        appeal lives at the inputs:
      </p>
      <ul>
        <li><strong>Reviews</strong> — appeal via <a href="/account/reviews">/account/reviews</a> (per-review).</li>
        <li><strong>Fraud signals</strong> — appeal path on <a href="/account/standing">/account/standing</a>.</li>
        <li><strong>Disputes</strong> — own resolution flow.</li>
      </ul>
    

      <TypeSignature
        type="methodology-page"
        origin="trust-engine — the 0–100 summary of a user's track record; first methodology page on the platform"
        doctrines={["transparency", "substrate-honesty", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
          { label: "/account/trust", href: "/account/trust" },
        ]}
      />
    </>
  );
}
