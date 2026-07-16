import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "CTCG Pro — membership",
  description:
    "What CTCG Pro is, what it costs, exactly what you get, and why there's no catch. £3.99/mo or £29.99/yr — or free at £300/yr spend.",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function ProMethodology() {
  return (
    <>
      <h1>CTCG Pro</h1>
      <p>
        Pro is an optional paid membership. It costs{" "}
        <strong>£3.99/month</strong> or <strong>£29.99/year</strong>. It exists
        for one reason: to pay you back more than it costs if you buy or sell
        here regularly — and to do it without hiding anything.
      </p>

      <h2>What you get</h2>
      <ul>
        <li><strong>5% off every store order.</strong> Applied at checkout, shown as a line you can see.</li>
        <li><strong>Lower selling fees.</strong> 7% on peer-to-peer sales (vs the standard 8%) and 10% on auctions (vs 12%).</li>
        <li><strong>1.5&times; Berries</strong> on purchases, and <strong>1% cashback</strong> to your store credit.</li>
        <li><strong>5% extra trade-in credit</strong> when you sell cards to us for credit.</li>
        <li><strong>Early access to restocks</strong> of hot singles.</li>
      </ul>

      <h2>The honest part</h2>
      <p>
        <strong>There&rsquo;s no wall.</strong> Pro doesn&rsquo;t take away anything
        you have today — it adds a discount and lowers your fees. Everything that
        is free now stays free.
      </p>
      <p>
        <strong>Pro is a subscription.</strong> The free Bronze&ndash;Gold tiers move
        with your annual spend, but Pro &mdash; like Platinum &mdash; is reached by
        subscribing; there is no spend threshold that grants a paid tier.
      </p>
      <p>
        <strong>If a fee isn&rsquo;t on this page, we don&rsquo;t charge it.</strong>{" "}
        Cancel anytime from{" "}
        <Link href="/account/billing">your billing page</Link> — you keep Pro
        until the period you&rsquo;ve paid for ends, then you drop back to your
        normal spending-based tier. No exit fee.
      </p>

      <h2>Is it worth it?</h2>
      <p>
        Plainly: the 5% discount alone covers the £3.99 once you spend about £80 in
        a month. Below that, you&rsquo;re paying for the lower selling fees, the
        bonus credit, and early access — so Pro makes most sense if you buy or sell
        here often. If you don&rsquo;t, the free tiers already give you cashback and
        a fair price. We&rsquo;d rather tell you that than sell you a subscription
        you won&rsquo;t use.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="tiers table (is_paid Pro tier) + the generic subscription checkout + webhook — a paid membership priced below its delivered value"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
          { label: "/methodology/fees", href: "/methodology/fees" },
          { label: "/methodology/store-credit", href: "/methodology/store-credit" },
        ]}
      />
    </>
  );
}
