import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Store credit (historical)",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function StoreCreditMethodology() {
  return (
    <>
      <h1>Store credit</h1>
      <blockquote>
        <strong>This page is historical.</strong> The shop era ended on{" "}
        <strong>2026-07-06</strong> (see the decision record:{" "}
        <code>docs/decisions/2026-07-06-collectors-first.md</code>). Store
        credit was currency you could earn and spend at the Cambridge TCG
        shop; with the shop closed, there is nothing left to spend it at —
        and, verified on the closing day, <strong>no balances were
        outstanding</strong> (0 users held credit; £0.00 total). The shop
        closed owing nothing to anyone. Selling now happens between
        collectors on the <a href="/market">market</a>, in cash, via{" "}
        <a href="/account/payouts">payouts</a>.
      </blockquote>
      <p>
        Store credit was recorded in the <code>store_credit_ledger</code> table — every grant
        and spend an append-only ledger row, with a <code>balance_after</code> column you can
        reconcile against. The ledger table stays; history is history. Any credit rows you
        see in your account history keep their original labels.
      </p>
      <h2>How credit was earned (shop era)</h2>
      <ul>
        <li><strong>Cashback</strong> on B2C orders — a % of the line total that scaled with the member&rsquo;s tier at the time (tiers have since been retired).</li>
        <li><strong>Trade-in (credit option)</strong> — accepting the credit quote instead of cash. (No trade-in was ever submitted.)</li>
        <li><strong>Bounty sell-back</strong> — selling a vault item back to the platform for 77% spot price.</li>
        <li><strong>Refunds to credit</strong> — when applicable, refunds could be issued as credit.</li>
        <li><strong>Liquidity mining</strong> — the market-maker incentive program (paused 2026-07-06: it paid store credit, which no longer has a spending door).</li>
        <li><strong>Operator grants</strong> — staff or retention adjustments.</li>
      </ul>
      <h2>How credit was spent (shop era)</h2>
      <p>
        Credit was applied at the shop&rsquo;s checkout as a one-shot Stripe coupon for the
        available balance (or the order total, whichever was smaller), deducted on{" "}
        <code>checkout.session.completed</code> via the Stripe webhook. That checkout closed
        with the shop.
      </p>
      <p>
        If a future incentive programme needs a non-money unit again, it will be designed
        openly and get its own methodology page — this one stays as the record of the
        shop-era system.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="store_credit_ledger + checkout coupon flow — the shop-era non-money value system, retired 2026-07-06 with zero balances outstanding (collectors-first decision)"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/fees", href: "/methodology/fees" },
        ]}
      />
    </>
  );
}
