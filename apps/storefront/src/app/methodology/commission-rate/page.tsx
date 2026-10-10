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
        Commission is <strong>0%</strong>, and has been since 21 July 2026. Trades and
        auctions agreed on or after 21 July 2026 carry 0% commission, including those still
        settling after new paid commerce was retired on 23 September 2026: the seller keeps{" "}
        <strong>100%</strong> of the sale. Earlier trades keep the commission recorded when they
        were matched. There are no tiers and no membership; the rate is the same for everyone.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The single per-item commission function —{" "}
        <code>computeCommissionAmount</code> in{" "}
        <code>packages/pricing/src/index.ts</code> — returns <code>0</code> unconditionally, so
        no call site can charge a fee. Commission is stored when a trade is matched, so earlier
        trades keep the commission recorded when they were matched; trades and auctions agreed
        on or after 21 July 2026 carry 0%, including those still settling.
      </blockquote>
      <p>
        The fuller story — why the platform is free and what it means for buyers — lives at{" "}
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
