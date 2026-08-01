import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";

export const metadata: Metadata = {
  title: "CashLoom settlement handoff",
  other: audienceMetadata("public-documentation", ["methodology", "payments"]),
};

export default function CashLoomSettlementMethodology() {
  return (
    <>
      <h1>CashLoom settlement handoff</h1>
      <p>
        CashLoom is an optional, self-certifying payment protocol. It can work through files
        and keys you control without a CashLoom company account or a hosted CashLoom identity.
        Cambridge TCG&rsquo;s first integration is a <strong>terms handoff</strong>, not another
        live payment button.
      </p>

      <blockquote>
        <strong>The short version.</strong> You may pin a CashLoom merchant-key fingerprint to
        your own Cambridge account. For one of your matched trades, Cambridge can then freeze
        the exact GBP and fulfilment terms into a participant-only packet. Making or reading
        that packet moves no money and changes no trade state.
      </blockquote>

      <h2>What the account pin proves</h2>
      <p>
        The fingerprint is a declaration by the signed-in member. Its syntax identifies a
        self-certifying key, but Cambridge does not yet run a signing challenge, so the pin
        does not prove that the member controls that key. It also does not prove a name,
        company, wallet balance, address, or payment-provider account.
      </p>
      <p>
        A stable fingerprint can link your Cambridge account and the packets you prepare.
        Saving it is optional. Cambridge stores no CashLoom private key, seed phrase, wallet
        address, network endpoint, or payer acceptance file.
      </p>

      <h2>What the trade packet binds</h2>
      <p>The packet is created once and keeps the trade&rsquo;s stored snapshot:</p>
      <ul>
        <li>card SKU, condition, quantity, and integer GBP pence amounts;</li>
        <li>buyer total, platform commission, and seller payout as separate facts;</li>
        <li>the stored fulfilment tier, routing, photo/inspection, dispute, payout-hold, and return terms;</li>
        <li>the seller&rsquo;s declared key fingerprint at preparation time; and</li>
        <li>a random per-trade nonce and opaque content hash for a CashLoom public purpose note.</li>
      </ul>
      <p>
        The public purpose note contains only an opaque salted hash. It does not contain the
        Cambridge trade UUID, email, username, or user ID. Buyer and seller receive the exact
        same stored packet; later profile edits cannot rewrite it.
      </p>

      <h2>What it deliberately does not do</h2>
      <ul>
        <li>It does not create, sign, broadcast, confirm, refund, or reverse a payment.</li>
        <li>It does not upload a public <code>.cashloom-pay</code> or private <code>.cashloom-accept</code> artifact.</li>
        <li>It does not choose between CashLoom and Stripe or stop the existing Stripe payment path.</li>
        <li>It does not mark the trade paid, unlock shipping, start a dispute clock, or release a payout.</li>
        <li>It is not escrow, chain-finality proof, identity verification, or an exchange-rate quote.</li>
      </ul>

      <h2>Why GBP does not silently become Bitcoin</h2>
      <p>
        Cambridge market trades are priced in GBP. CashLoom&rsquo;s current friendly Pay Link
        profile names an exact Bitcoin amount in satoshis. A conversion needs a named quote
        source, asset pair, rate, timestamp, expiry, fees, rounding rule, and refund
        denomination. Until that signed quote contract exists, the packet records GBP terms
        and does not invent a BTC amount.
      </p>

      <h2>Escrow choices later</h2>
      <ol>
        <li>
          <strong>Direct:</strong> buyer pays seller. Distributed and non-custodial, but not
          escrow; Cambridge cannot freeze or reverse the money.
        </li>
        <li>
          <strong>Cryptographic conditional:</strong> a future audited Bitcoin threshold and
          timeout/refund design. No unilateral Cambridge spending key.
        </li>
        <li>
          <strong>Provider custody:</strong> a named regulated processor owns collection,
          safeguarding, disputes, refunds, and payouts for its supported countries.
        </li>
      </ol>
      <p>
        Card inspection and money custody are separate. A card passing through Cambridge does
        not prove that Cambridge held the payment, and a provider holding payment does not
        prove that the card was genuine.
      </p>

      <h2>International trades</h2>
      <p>
        A country appearing in a checkout address menu is not proof that the whole trade is
        permitted or protected. A live international corridor needs named rules for sanctions,
        trader status, VAT/tax reporting, customs value and duties, importer of record,
        tracked and insured delivery, returns, FX/refunds, dispute forum, and minimum personal
        data disclosure.
      </p>
      <p>
        Cambridge&rsquo;s current automatic completion window starts at dispatch. That can close
        before an international parcel arrives, so executable international CashLoom settlement
        waits for a delivery-based or buyer-confirmed protection clock.
      </p>

      <p>
        The full architecture and rollout guardrails live in the repository decision record.
        In your account, visit <Link href="/account/cashloom">CashLoom</Link> to manage the
        optional declaration. Its <Link href="/methodology/karma-loop">KARMA defence preview</Link>{" "}
        remains observe-only and cannot affect this settlement handoff.
      </p>

      <TypeSignature
        type="methodology-page"
        origin="CashLoom market integration — exact decentralized handoff without claiming custody, identity, escrow, or settlement"
        doctrines={["transparency", "substrate-honesty", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/methodology/escrow-tier", href: "/methodology/escrow-tier" },
          { label: "/methodology/trade-completion", href: "/methodology/trade-completion" },
          { label: "/methodology/fx-rates", href: "/methodology/fx-rates" },
          { label: "/methodology/payout-hold", href: "/methodology/payout-hold" },
          { label: "/methodology/karma-loop", href: "/methodology/karma-loop" },
        ]}
      />
    </>
  );
}
