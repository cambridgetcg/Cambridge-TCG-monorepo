import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Fees — there are none",
  description:
    "Cambridge TCG takes no commission or service fee and has no membership. New paid commerce was retired on 23 September 2026. Trades and auctions agreed on or after 21 July 2026 carry 0% commission, including those still settling; earlier trades keep the commission recorded when they were matched.",
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
        Yu&rsquo;s promise was <em>minimum fees, maximum value</em>. From 21 July 2026
        the minimum was zero: the platform charged nothing to buy, sell, or list on the{" "}
        <Link href="/market">peer-to-peer market</Link> or at{" "}
        <Link href="/auctions">auction</Link>. New paid commerce was retired on 23
        September 2026, so no new sales are admitted. Trades and auctions agreed on or
        after 21 July 2026 carry 0% commission, including those still settling: when a
        card sold for £40, the seller receives £40. Earlier trades keep the commission
        recorded when they were matched.
      </p>
      <p>
        There is no membership either. A paid tier used to buy one thing — a lower
        commission — and now that commission is zero for everyone, so the tiers
        simply went away. Buyers paid sellers through the platform&rsquo;s escrow, and
        agreements still settling work the same way. Cambridge TCG takes no cut of
        anything agreed on or after 21 July 2026.
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
        recorded with — history stays honest. Trades and auctions agreed on or after
        21 July 2026 carry 0%, including those still settling; earlier trades keep the
        commission recorded when they were matched.
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
