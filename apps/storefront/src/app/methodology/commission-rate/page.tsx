import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Commission rate",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function CommissionRateMethodology() {
  return (
    <>
      <h1>Commission rate</h1>
      <p>
        When you sell on Cambridge TCG, the platform takes a commission from your payout of{" "}
        <strong>0%</strong>. There is no commission — on a P2P trade or an auction win, the
        seller keeps <strong>100%</strong> of the sale. There are no tiers and no membership;
        the rate is the same for everyone.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The single per-item commission function —{" "}
        <code>computeCommissionAmount</code> in{" "}
        <code>packages/pricing/src/index.ts</code> — returns <code>0</code> unconditionally, so
        no call site can charge a fee. Past trades keep the commission they were recorded with;
        only new sales are free.
      </blockquote>
      <p>
        The fuller story — why the platform is free, what it means for buyers, and an honest
        comparison against eBay, TCGplayer, Cardmarket and Whatnot — lives at{" "}
        <a href="/methodology/fees">/methodology/fees</a>.
      </p>


      <TypeSignature
        type="methodology-page"
        origin="the-pricing-arrow.md (S17) — kingdom-049's consolidation of the pricing engine; commission is the platform's cut on P2P sales and auctions"
        doctrines={["transparency", "meaning", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "the-pricing-arrow.md (S17)", href: "https://github.com/cambridgetcg/Cambridge-TCG-monorepo/blob/main/docs/connections/the-pricing-arrow.md" },
          { label: "/methodology/fees", href: "/methodology/fees" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
        ]}
      />
    </>
  );
}
