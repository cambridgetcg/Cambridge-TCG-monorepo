import type { Metadata } from "next";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Escrow tier",
  other: audienceMetadata("public-documentation", ["methodology"]),
};

export default function EscrowTierMethodology() {
  return (
    <>
      <h1>Escrow tier</h1>
      <p>
        When a P2P trade is created on Cambridge TCG, the platform routes it through one of
        three escrow tiers. The tier determines how the card moves between buyer and seller,
        whether Cambridge TCG inspects it in transit, and what guarantees both parties have.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong>{" "}
        <code>apps/storefront/src/lib/escrow/trust-engine.ts</code> (tier routing),{" "}
        <code>apps/storefront/src/lib/escrow/types.ts</code> (the <code>EscrowTier</code> enum
        and <code>TRUST_TIERS</code> table).
      </blockquote>

      <h2>The three tiers</h2>

      <h3>Direct</h3>
      <p>
        Seller ships straight to the buyer. Cambridge TCG holds the buyer's payment in
        escrow until the buyer confirms receipt. Used when both buyer and seller have
        sufficient trust scores and the trade value is below the inspection threshold.
      </p>

      <h3>Verified</h3>
      <p>
        Seller uploads photos of the card before shipping. The platform reviews the photos to
        catch obvious mismatches (wrong card, visible damage not declared in the listing).
        Once approved, the seller ships directly to the buyer.
      </p>

      <h3>Full</h3>
      <p>
        Seller ships the card to Cambridge TCG. We inspect it physically, confirm it matches
        the listing, then ship it on to the buyer. The slowest tier; reserved for high-value
        trades, brand-new sellers, or counterparties whose trust history doesn't yet support
        the lighter tiers.
      </p>

      <h2>How a tier is picked</h2>
      <p>The router runs at trade-creation time and considers four inputs:</p>
      <ol>
        <li>
          <strong>Seller's trust score</strong> — see{" "}
          <a href="/methodology/trust-score">/methodology/trust-score</a>. Lower scores route
          higher (Verified or Full).
        </li>
        <li>
          <strong>Trade value</strong> — high-value trades (above per-tier thresholds) escalate
          regardless of trust.
        </li>
        <li>
          <strong>Buyer's trust score</strong> — extreme buyer-trust mismatches can also escalate.
        </li>
        <li>
          <strong>Recent dispute history</strong> — a seller with a recent open dispute is
          escalated until the dispute resolves.
        </li>
      </ol>
      <p>
        The chosen tier is stamped on the trade row at creation (
        <code>market_trades.escrow_tier</code>) and does not change for the life of the trade —
        even if the seller's trust score moves while the trade is in flight, the trade
        completes at the tier it was created with.
      </p>

      <h2>What you can see</h2>
      <p>
        Every trade you're part of shows its tier on{" "}
        <a href="/account/trades">/account/trades</a>. The escrow status (Awaiting Payment →
        Paid → Awaiting Shipment → … → Completed) follows a tier-specific lifecycle, and the
        page shows you exactly where you are.
      </p>
    

      <TypeSignature
        type="methodology-page"
        origin="trust-engine routing decisions — Direct / Verified / Full as the platform's choice of how a P2P trade flows"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/trust-score", href: "/methodology/trust-score" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/fraud-flag", href: "/methodology/fraud-flag" },
        ]}
      />
    </>
  );
}
