import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Store credit",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function StoreCreditMethodology() {
  return (
    <>
      <h1>Store credit</h1>
      <p className="text-sm uppercase tracking-wider text-amber-400">Stub — full content forthcoming.</p>
      <p>
        Store credit is currency you hold on Cambridge TCG that can be spent at checkout. It
        is recorded in the <code>store_credit_ledger</code> table — every grant and spend is
        an append-only ledger row, with a <code>balance_after</code> column you can
        reconcile against.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The ledger is{" "}
        <code>store_credit_ledger</code>; the balance cache is{" "}
        <code>users.store_credit_balance</code>; spend at checkout is a one-shot Stripe coupon
        applied during the checkout session.
      </blockquote>
      <h2>How credit is earned</h2>
      <ul>
        <li><strong>Cashback</strong> on B2C orders — % of the line total per your membership tier.</li>
        <li><strong>Trade-in (credit option)</strong> — accept the credit quote instead of cash.</li>
        <li><strong>Bounty sell-back</strong> — sell a vault item back to the platform for 77% spot price.</li>
        <li><strong>Refunds to credit</strong> — when applicable, refunds may be issued as credit.</li>
        <li><strong>Liquidity mining</strong> — the market-maker incentive program (if active).</li>
        <li><strong>Operator grants</strong> — staff or retention adjustments.</li>
      </ul>
      <h2>How credit is spent</h2>
      <p>
        Credit is applied at checkout as a one-shot Stripe coupon for the available balance
        (or the order total, whichever is smaller). The deduction happens on{" "}
        <code>checkout.session.completed</code> via the Stripe webhook.
      </p>
      <p>
        Credit cannot be cashed out. It is non-transferable (no gifting between accounts) and
        does not expire today, though that policy may change — the change would land here in
        the same PR.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="store_credit_ledger + checkout coupon flow — non-money value earned and spent at Cambridge TCG"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
        ]}
      />
    </>
  );
}
