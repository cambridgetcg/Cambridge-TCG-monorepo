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
      <p>
        Store credit is non-money value you hold on Cambridge TCG. It is recorded in the{" "}
        <code>store_credit_ledger</code> table — every grant and deduction is an append-only
        ledger row, with a <code>balance_after</code> column you can reconcile against. Your
        balance and full ledger are visible on <code>/account/standing</code>.
      </p>
      <blockquote>
        <strong>Where this lives in code.</strong> The ledger is{" "}
        <code>store_credit_ledger</code>; the balance cache is{" "}
        <code>users.store_credit_balance</code>.
      </blockquote>
      <h2>How credit is earned</h2>
      <ul>
        <li><strong>Refunds to credit</strong> — when applicable, refunds may be issued as credit.</li>
        <li><strong>Bounty sell-back</strong> — convert a vault prize back to the prize pool for credit.</li>
        <li><strong>Liquidity rewards</strong> — credit for resting honest asks on the market.</li>
        <li><strong>Operator grants</strong> — staff or retention adjustments.</li>
      </ul>
      <h2>Where credit goes</h2>
      <p>
        The retail checkout is retired — the platform sells nothing and holds no market
        position (see <a href="/methodology/regulator">/methodology/regulator</a>). That
        means credit currently has no first-party spend path. Its sinks are being
        re-anchored to the prize economy (raffle entries, pull tokens) in a coming change;
        until then your balance simply persists in the ledger. Nothing is lost — every
        grant remains an auditable row.
      </p>
      <p>
        Credit cannot be cashed out. It is non-transferable (no gifting between accounts) and
        does not expire today, though that policy may change — the change would land here in
        the same PR.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="store_credit_ledger — non-money value earned through refunds, prizes, and market participation"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/regulator", href: "/methodology/regulator" },
          { label: "/methodology/commission-rate", href: "/methodology/commission-rate" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/membership-tier", href: "/methodology/membership-tier" },
        ]}
      />
    </>
  );
}
