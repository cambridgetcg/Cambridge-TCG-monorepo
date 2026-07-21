import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Fees — there are none",
  description:
    "Cambridge TCG takes no commission and no service fee. Sellers keep 100% of every sale, on the market and at auction. There is no membership fee. Buyers pay sellers directly; the platform takes nothing.",
  other: audienceMetadata("public-documentation", ["fees", "methodology", "free"]),
};

export default function FeesMethodology() {
  return (
    <>
      <Audience kind="public-documentation" contexts={["fees", "methodology"]} />
      <h1>Fees</h1>
      <blockquote>
        <strong>There are none.</strong> Cambridge TCG takes no commission and no
        service fee. Every seller keeps <strong>100%</strong> of every sale.
      </blockquote>
      <p>
        Yu&rsquo;s promise was <em>minimum fees, maximum value</em>. As of 21 July 2026
        the minimum is zero: the platform charges nothing to buy, sell, or list —
        on the <Link href="/market">peer-to-peer market</Link> and at{" "}
        <Link href="/auctions">auction</Link> alike. When a card sells for £40, the
        seller receives £40. When it sells for £4,000, the seller receives £4,000.
      </p>
      <p>
        There is no membership either. A paid tier used to buy one thing — a lower
        commission — and now that commission is zero for everyone, so the tiers
        simply went away. Buyers pay sellers directly through the platform&rsquo;s
        escrow; Cambridge TCG takes no cut of that payment.
      </p>
      <p>
        The free <Link href="/rewards">Rewards Hub</Link> — daily spins, packs,
        raffles — is open to everyone, with Berries earned at one flat rate. It costs
        nothing and never has.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The single place a per-item
        commission is computed — <code>computeCommissionAmount</code> in{" "}
        <code>packages/pricing/src/index.ts</code> — now returns <code>0</code>
        unconditionally, so no write path can charge a fee at any call site. Every
        rate constant is 0. Past trades and settled auctions keep the fee they were
        recorded with — history stays honest; only new sales are free.
      </blockquote>
      <TypeSignature
        type="methodology-page"
        origin="packages/pricing (computeCommissionAmount → 0) — the platform charges no commission or service fee"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
      />
    </>
  );
}
