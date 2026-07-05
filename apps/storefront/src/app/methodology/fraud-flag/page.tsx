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
      <p className="text-sm uppercase tracking-wider text-accent">Stub — full content forthcoming.</p>
      <p>
        Cambridge TCG runs a fraud-detection sweep against trading patterns. When a pattern
        matches, a <code>fraud_signal</code> is raised against the user's account. The signal
        carries a severity (low / medium / high / critical) and a recommended auto-action
        (none / suspend / hold-payouts).
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>{" "}
        <code>apps/storefront/src/lib/fraud/detection.ts</code> (the patterns),{" "}
        <code>apps/storefront/src/lib/fraud/sweep.ts</code> (the sweep), and{" "}
        <code>apps/storefront/src/lib/fraud/auto-suspend.ts</code> (the auto-action).
      </blockquote>
      <h2>What the sweep looks at</h2>
      <ul>
        <li><strong>rapid_listing</strong> — a burst of orders in a short time window.</li>
        <li><strong>self_trading</strong> — counterparty shares a shipping address with you.</li>
        <li><strong>refund_abuse</strong> — multiple buyer-favour refunds recently.</li>
        <li><strong>velocity_spike</strong> — sudden volume jump vs your baseline.</li>
        <li><strong>new_account_high_value</strong> — large order on a new account.</li>
        <li><strong>chargeback</strong> — bank chargeback filed on a paid trade.</li>
      </ul>
      <h2>How flags clear</h2>
      <p>
        Most flags clear automatically as your activity normalises (the sweep re-evaluates
        every minute). Some require operator review or user action — see your active flags
        on <a href="/account/standing">/account/standing</a> for per-flag guidance.
      </p>
      <h2>Effect on trust score</h2>
      <p>
        An unresolved fraud signal of medium severity or higher penalises your trust score by
        −20 per signal. See <a href="/methodology/trust-score">/methodology/trust-score</a>{" "}
        for the full penalty model.
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
