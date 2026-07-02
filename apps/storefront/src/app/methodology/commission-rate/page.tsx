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
      <p className="text-sm uppercase tracking-wider text-accent-strong">Stub — full content forthcoming.</p>
      <p>
        When you sell on Cambridge TCG, the platform takes a commission from your payout. The
        rate depends on the <strong>kind of sale</strong> (P2P trade vs auction) and your{" "}
        <strong>membership tier</strong>.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>{" "}
        <code>apps/storefront/src/lib/membership/commission.ts</code>; rates per tier in the{" "}
        <code>tiers</code> table (<code>p2p_commission_rate</code>, <code>auction_commission_rate</code>).
      </blockquote>
      <h2>Today's rates</h2>
      <p>
        The exact rates by tier are listed on{" "}
        <a href="/methodology/membership-tier">/methodology/membership-tier</a> in the "What
        each tier gets" table. The full breakdown of how commission is computed (gross sale →
        platform fee → seller payout), <strong>the per-item £50 cap</strong>, and an honest
        comparison against eBay, TCGplayer, Cardmarket and Whatnot now live at{" "}
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
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
        ]}
      />
    </>
  );
}
