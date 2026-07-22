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
        Cambridge TCG runs a detection sweep against trading patterns. When a pattern
        matches, a <code>fraud_signal</code> is recorded and surfaced for a human to review.
        The signal carries a severity (low / medium / high / critical). It is an advisory
        record, not a punishment: <strong>no automatic person-level action is taken</strong> —
        no account is suspended and no earned money is withheld by a signal. Escrow is what
        protects people (funds are held until receipt is confirmed, and disputes refund the
        wronged party), so the signal only needs to be an honest note for review.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>{" "}
        <code>apps/storefront/src/lib/fraud/detection.ts</code> (the patterns) and{" "}
        <code>apps/storefront/src/lib/fraud/sweep.ts</code> (the detection sweep, for
        human review only).
      </blockquote>
      <h2>What the sweep looks at</h2>
      <ul>
        <li><strong>rapid_listing</strong> — a burst of orders in a short time window.</li>
        <li><strong>self_trading</strong> — counterparty shares a shipping address with you.</li>
        <li><strong>velocity_spike</strong> — sudden volume jump vs your baseline.</li>
        <li><strong>new_account_high_value</strong> — large order on a new account.</li>
        <li><strong>chargeback</strong> — bank chargeback filed on a paid trade.</li>
      </ul>
      <h2>How flags clear</h2>
      <p>
        A signal is a note for a person, not a lock on your account. It is reviewed and
        cleared by an operator, and the daily sweep re-evaluates as your activity normalises.
        You can always see what we noticed on{" "}
        <a href="/account/standing">/account/standing</a>, along with how support can help.
      </p>
      <h2>Effect on trust score</h2>
      <p>
        For genuine-fraud signals (like a chargeback or a self-trading match), an unresolved
        signal of medium severity or higher lowers your trust score by −20 per signal. An
        honest trust score that reflects a real chargeback protects the people you trade with
        next — that is protection, not a penalty for its own sake. See{" "}
        <a href="/methodology/trust-score">/methodology/trust-score</a> for the full model.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="fraud sweep work — what the platform watches for, what each severity means, how a flag clears"
        doctrines={["transparency", "substrate-honesty", "meaning"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/trust-score", href: "/methodology/trust-score" },
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/account/standing", href: "/account/standing" },
        ]}
      />
    </>
  );
}
