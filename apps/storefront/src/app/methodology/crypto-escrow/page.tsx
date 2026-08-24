import type { Metadata } from "next";
import Link from "next/link";
import { audienceMetadata, TypeSignature } from "@/lib/ui";
import {
  CRYPTO_ESCROW_ADAPTER_PHASES,
  CRYPTO_ESCROW_TEST_ASSET,
} from "@/lib/payments/crypto-escrow-contract";

export const metadata: Metadata = {
  title: "Crypto wallet and escrow boundary",
  description:
    "What Cambridge TCG's testnet wallet link proves, why crypto checkout remains off, and the evidence required before a P2P trade can be called funded or released.",
  other: audienceMetadata("public-documentation", [
    "methodology",
    "payments",
    "testnet",
  ]),
};

const SETTLEMENT_STATES = [
  "prepared",
  "authorization_pending",
  "submitted",
  "submission_unknown",
  "observed_unfinalized",
  "reconciling",
  "funded_final",
  "funding_review",
  "shipped",
  "shipping_review",
  "inspection",
  "inspection_review",
  "releasable",
  "release_review",
  "released",
] as const;

export default function CryptoEscrowMethodology() {
  return (
    <>
      <h1>Crypto wallet + P2P escrow</h1>
      <p>
        Cambridge TCG is building a non-custodial wallet-link seam and an
        escrow integration contract.{" "}
        <strong>Crypto checkout is not live.</strong> No real-value token,
        deployed Cambridge escrow contract, or production release/refund path
        exists in this version.
      </p>

      <blockquote>
        <strong>Current substrate.</strong> The only named environment is{" "}
        <code>{CRYPTO_ESCROW_TEST_ASSET.caip2}</code> (
        {CRYPTO_ESCROW_TEST_ASSET.network}) with Circle test{" "}
        <code>{CRYPTO_ESCROW_TEST_ASSET.symbol}</code> at{" "}
        <code>{CRYPTO_ESCROW_TEST_ASSET.contractAddress}</code>. Circle states
        that this testnet token has no financial value. Checkout and value
        transfer remain disabled.
      </blockquote>

      <h2>What linking a wallet proves</h2>
      <p>
        A fresh EIP-4361 signature can prove that the signed-in Cambridge
        account controlled the stated wallet when it answered the one-use
        challenge. It does not prove legal identity, source of funds, beneficial
        ownership of every wallet asset, KYC or sanctions status, or future
        ability to pay. Cambridge never asks for a seed phrase or private key.
      </p>
      <p>
        Each challenge lasts five minutes, is bound to the exact Cambridge
        database session and canonical site origin, and can be consumed once.
        Issuance is serialized and capped at 20 challenges per account in a
        rolling hour; reaching the cap creates no new challenge and returns a
        retry-later error.
      </p>
      <p>
        Before any message proof, local signature work or RPC call, PostgreSQL
        atomically reserves an attempt using its post-lock clock. Failed proofs
        still consume one of five attempts per challenge and 40 per account in a
        rolling hour. A deployment-edge limiter is still required before any
        production rollout so abusive traffic is rejected before application or
        database work.
      </p>
      <p>
        EOA signatures are checked locally. After local failure, an explicitly
        configured HTTPS RPC (HTTP only on localhost) must report Base Sepolia
        chain ID 84532. Cambridge sends only the public address to classify
        deployed code; the exact message and signature go to that RPC only for
        deployed code or a locally recognized ERC-6492 proof. A remote endpoint
        is unusable unless its public provider name and HTTPS privacy link are
        configured and shown beside the linking action; the endpoint itself and
        any credential remain server-only.
      </p>
      <p>
        Revocation in this testnet version marks the current registry link
        revoked and retains that history. It does not cancel a challenge that
        was already issued or whose signature is being verified; that proof can
        create a fresh link until the signed five-minute expiry. Production
        payment use therefore requires a shared per-address generation or epoch
        so a completed revoke also makes every older proof stale.
      </p>
      <p>
        Turning off new wallet-link issuance does not disable revocation. A
        signed-in participant can still revoke their own existing link while the
        canonical origin and registry remain available.
      </p>

      <h2>Why a transaction hash is not payment</h2>
      <p>
        A browser can report a hash for a transaction that later reverts, lands
        on the wrong chain, transfers the wrong token or amount, pays the wrong
        contract, is replaced, or is removed by a reorganisation. The settlement
        contract therefore keeps these states separate:
      </p>
      <ol>
        {SETTLEMENT_STATES.map((state) => (
          <li key={state}>
            <code>{state}</code>
          </li>
        ))}
      </ol>
      <p>
        Only exact, independently observed, successful and finalized evidence
        may advance
        <code> reconciling </code> to <code>funded_final</code>. Release is
        later still: the physical card must pass the agreed shipping and
        inspection window with no blocking dispute, return, reversal or fraud
        hold.
      </p>
      <p>
        A submitted transaction can time out locally and still land later, so
        <code> submitted </code> cannot become terminal <code>failed</code> just
        because an observer has not found it yet. Ambiguous broadcast or
        temporarily missing evidence moves to the recoverable
        <code> submission_unknown </code> state. Observation continues from
        there; only independent evidence can move it forward. Pre-funding
        uncertainty cannot enter a fulfilment review state.
      </p>
      <p>
        Holds after funding are phase-specific: <code>funding_review</code>,
        <code>shipping_review</code>, <code>inspection_review</code>, and
        <code>release_review</code>. This preserves what has actually happened:
        every possible path to <code>released</code> must pass
        <code> funded_final → shipped → inspection → releasable </code> first.
      </p>

      <h2>The exact reconciliation</h2>
      <p>The fixed quote and observed event must agree on every field:</p>
      <ul>
        <li>chain ID and exact token contract;</li>
        <li>escrow contract and integer atomic amount;</li>
        <li>
          non-empty bounded opaque trade reference, payer and beneficiary;
        </li>
        <li>positive settlement generation and exact 32-byte terms digest;</li>
        <li>
          fixed expiry and observed block-inclusion time no later than it;
        </li>
        <li>successful receipt, explicit finality and a non-removed log;</li>
        <li>unique event identity: chain + transaction hash + log index.</li>
      </ul>
      <p>
        Wrong-chain or late deposits go to reconciliation; they do not silently
        unlock shipping. Overpayment does not authorize a larger trade.
        Underpayment is not partial success.
      </p>

      <h2>Who is allowed to say what</h2>
      <p>
        The adapter is deliberately split into{" "}
        {CRYPTO_ESCROW_ADAPTER_PHASES.map((phase, index) => (
          <span key={phase}>
            <code>{phase}</code>
            {index < CRYPTO_ESCROW_ADAPTER_PHASES.length - 1 ? " → " : "."}
          </span>
        ))}
        A wallet may authorize; an RPC or provider may observe; the
        reconciliation command may compare evidence; the physical-goods workflow
        may declare a release eligible. No single browser callback owns all four
        claims.
      </p>

      <h2>What must happen before production</h2>
      <ul>
        <li>
          Port a one-rail, commit-before-provider payment reservation and repair
          the existing Stripe refund/cancellation/payout races first.
        </li>
        <li>
          Obtain UK legal/compliance advice for the exact custody, P2P,
          stablecoin, financial promotion, Travel Rule, sanctions and
          payment-services flow.
        </li>
        <li>
          Confirm provider and seller eligibility; independently audit any
          settlement contract, roles, emergency powers, refund paths and upgrade
          policy.
        </li>
        <li>
          Test replay, concurrent payment, expiry, late deposit, replacement,
          reorg, duplicate event, refund, dispute and double-release paths
          before any capped pilot.
        </li>
      </ul>

      <p>
        The full engineering record is public in{" "}
        <code>
          docs/decisions/2026-08-23-crypto-wallet-and-escrow-boundary.md
        </code>
        . Related platform rules:{" "}
        <Link href="/methodology/escrow-tier">escrow routing</Link>,{" "}
        <Link href="/methodology/trade-completion">trade completion</Link>, and{" "}
        <Link href="/methodology/payout-hold">payout hold</Link>.
      </p>

      <h2>Change history</h2>
      <ul>
        <li>
          <strong>v1 — 2026-08-23.</strong> Base Sepolia wallet proof and
          provider-neutral no-value escrow boundary; checkout withheld.
        </li>
      </ul>

      <TypeSignature
        type="methodology-page"
        origin="crypto wallet + P2P escrow boundary — testnet foundation, no production value"
        doctrines={["transparency", "substrate-honesty"]}
        audience="public-documentation"
        recursion={[
          {
            label: "/methodology/escrow-tier",
            href: "/methodology/escrow-tier",
          },
          {
            label: "/methodology/trade-completion",
            href: "/methodology/trade-completion",
          },
          {
            label: "/methodology/payout-hold",
            href: "/methodology/payout-hold",
          },
        ]}
      />
    </>
  );
}
