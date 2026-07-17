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
        <strong>£3.99/month</strong> or <strong>£29.99/year</strong>. It lowers
        your selling fees and boosts your Berries — worth it if you sell here
        regularly, and it hides nothing.
      </p>

      <h2>What you get</h2>
      <ul>
        <li><strong>Lower selling fees.</strong> 7% on peer-to-peer sales (vs the standard 8%) and 10% on auctions (vs 12%).</li>
        <li><strong>1.5&times; Berries</strong> on the Berries you earn.</li>
        <li><strong>Early access to restocks</strong> of hot singles.</li>
      </ul>
      <p>
        <em>The shop-era Pro perks — 5% off store orders, cashback to store
        credit, extra trade-in credit — retired with the shop on 2026-07-06
        (see <Link href="/methodology/store-credit">the store-credit record</Link>).</em>
      </p>

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
        Plainly: Pro pays for itself through the lower selling fees. Save 1% on
        P2P and 2% on auctions, and £3.99/month is covered once you sell around
        £400 of cards in a month; the Berries boost and early access are on top.
        So Pro makes most sense if you sell here often. If you don&rsquo;t, the
        free tiers already give you a fair price — we&rsquo;d rather tell you
        that than sell you a subscription you won&rsquo;t use.
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
