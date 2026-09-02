import type { Metadata } from "next";
import Link from "next/link";
import { Audience, TypeSignature, audienceMetadata } from "@/lib/ui";
import { PRISM_SIGNALS_PREVIEW_NOTICE } from "@/lib/prism-signals/presentation";

export const metadata: Metadata = {
  title: "PRISM Signals product flow",
  description:
    "How the synthetic PRISM Signals preview separates source rights, private scoring, offers, payment evidence, entitlement, web delivery, and Telegram delivery.",
  other: audienceMetadata("public-documentation", [
    "trader",
    "decision-support",
    "product-flow",
    "methodology",
  ]),
};

const PRODUCT_FLOW_NON_CLAIMS = [
  "Payment is not source permission.",
  "Transformation is not source permission.",
  "Secrecy is not source permission.",
  "Public reachability is not source permission.",
  "Channel access is not source or redistribution permission.",
] as const;

const LAUNCH_GATES = [
  "A production rights evaluator grants the exact subscriber-derived-signal purpose for every evidence class used.",
  "A deployed private provider and lawful source adapters pass expiry, replay, leakage, and failure-mode tests.",
  "A versioned production offer names a real price reference, terms, support, and only the rails actually available.",
  "Provider webhooks or APIs produce verified, idempotent settlement evidence.",
  "A durable entitlement store handles renewal, expiry, refund, revocation, replay, and repair.",
  "Web and Telegram delivery enforce the same rights and entitlement decisions and preserve the risk block.",
] as const;

export default function PrismSignalsMethodologyPage() {
  return (
    <>
      <Audience
        kind="public-documentation"
        contexts={["trader", "decision-support", "product-flow", "methodology"]}
      />

      <h1>PRISM Signals product flow</h1>
      <p>
        <strong>PRISM Signals by Cambridge TCG</strong> is a branded reading of
        the public opportunity-signal contract. Its narrow promise is:
        <strong> Potential deals, with the risks attached.</strong> The product
        wraps a bounded signal; it does not sell a raw source archive or reveal
        the private decision engine.
      </p>

      <blockquote>
        <strong>Current boundary — 2 September 2026.</strong>{" "}
        {PRISM_SIGNALS_PREVIEW_NOTICE}. There is no live offer, purchasable
        price, production signal feed, accepted payment, durable entitlement,
        subscribed channel, or outbound delivery path.
      </blockquote>

      <p>
        You can inspect the branded test at{" "}
        <Link href="/prism-signals">/prism-signals</Link> and its plain-language{" "}
        <Link href="/prism-signals/terms">preview terms</Link>. Visiting either
        page creates no account, order, subscription, reservation, or access.
      </p>

      <h2>What the synthetic card demonstrates</h2>
      <p>
        The page renders fixed copy, not a database result. It contains no real
        card, listing, seller, source URL, source row, or exact valuation. It
        demonstrates the information hierarchy a future signal must preserve:
      </p>
      <ul>
        <li>a potential-deal classification for further human inspection;</li>
        <li>coarse conservative spread and margin bands;</li>
        <li>confidence as evidence quality, never profit probability;</li>
        <li>liquidity as a separate fact, including <code>unknown</code>;</li>
        <li>inherent and evidence-related risks; and</li>
        <li>fixed non-claims, including no exit quote or profit guarantee.</li>
      </ul>
      <p>
        For the detailed signal economics, expiry, confidence, liquidity, and
        six fixed signal refusals, read{" "}
        <Link href="/methodology/opportunity-signals">
          opportunity-signal methodology
        </Link>
        .
      </p>

      <h2>Two gates answer two different questions</h2>
      <pre>
        <code>{`rights-cleared evidence
  → private engine
  → opportunity-signal/v1
  → PRISM presentation

provider-confirmed payment
  → bounded entitlement
  → web or Telegram delivery`}</code>
      </pre>
      <p>
        The upper line asks whether Cambridge may derive this signal from this
        evidence. The lower line asks whether this person may receive an
        already-lawful product through this channel. Neither line can prove the
        other.
      </p>
      <ul>
        {PRODUCT_FLOW_NON_CLAIMS.map((claim) => (
          <li key={claim}>{claim}</li>
        ))}
      </ul>
      <p>
        A future subscriber can therefore receive no signal when evidence
        rights, identity, costs, freshness, or provider checks fail. Paying for
        access is not a promise that Cambridge will manufacture a decision from
        ineligible evidence or find a guaranteed number of deals.
      </p>

      <h2>The reusable offer contract</h2>
      <p>
        The app-neutral <code>@cambridge-tcg/product-flow</code> package defines
        <code> cambridgetcg.product-offer/1</code>. PRISM uses the product id
        <code> prism-signals</code>. Preview and test offers belong to the test
        environment; a live offer belongs to production and requires an
        explicitly granted rights decision. The package validates that catalogue
        assertion&apos;s shape; it does not authenticate a rights authority,
        evidence binding, issuance, expiry, or signature. A live host must verify
        a separate bound attestation before composing the offer.
      </p>
      <p>
        Every offer declares both delivery channels and all payment rails.
        Inactive rails say <code>off</code> instead of disappearing:
      </p>
      <table>
        <thead>
          <tr>
            <th>Context</th>
            <th>Rail</th>
            <th>PRISM now</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Independent web purchase</td>
            <td><code>stripe_web</code></td>
            <td>Off</td>
          </tr>
          <tr>
            <td>Purchase initiated and fulfilled inside Telegram</td>
            <td><code>telegram_stars</code></td>
            <td>Off</td>
          </tr>
          <tr>
            <td>Additional independent web purchase</td>
            <td><code>paypal_web</code></td>
            <td>Later / off</td>
          </tr>
          <tr>
            <td>Additional independent web purchase</td>
            <td><code>crypto_web</code></td>
            <td>Later / off</td>
          </tr>
        </tbody>
      </table>
      <p>
        Stripe is the intended future rail for an independent web checkout. A
        digital product bought and fulfilled inside Telegram uses Telegram
        Stars only, subject to a fresh review of Telegram&apos;s then-current
        platform requirements before activation. PayPal and crypto remain
        web-only candidates and are not accepted here.
      </p>

      <h2>Checkout progress is not paid access</h2>
      <p>
        The product-flow reducer records distinct event meanings.
        <code> checkout_started</code>, <code>browser_return</code>, Telegram
        <code> precheckout_approved</code>, <code>channel_linked</code>, and
        <code> payment_failed</code> can advance an audit cursor. None can create
        or extend paid access.
      </p>
      <p>
        Only provider-confirmed payment or renewal evidence, bound to the same
        environment, offer, version, channel, rail, and price reference, may
        activate a time-bounded entitlement. Access then separately checks the
        offer status, rights, delivery availability, entitlement scope, time
        window, rail, and price reference.
      </p>
      <p>
        Those rules are pure contracts today. PRISM has no checkout adapter,
        provider reconciliation, durable event store, entitlement ledger,
        delivery worker, or revocation workflow. A browser return, bot link,
        synthetic reply, or page reload creates nothing.
      </p>

      <h2>The Telegram route is a fixture threshold</h2>
      <p>
        The test handler is disabled unless an explicit fixture-test mode and a
        valid Telegram webhook secret are configured. Before parsing an update
        it verifies the secret; it bounds request bodies, accepts only a small
        private-chat shape, returns no-store responses, and emits fixed
        synthetic copy.
      </p>
      <p>
        It reads no market data, invokes no private scorer, calls no payment
        provider, persists no update, and grants no entitlement. Pre-checkout is
        rejected while payment is off. Unexpected payment or refund updates get
        a retryable non-success response: the preview cannot persist, fulfil, or
        safely acknowledge a provider receipt. No bot is advertised unless the
        operator declares a new invoice-free bot, dropped pending updates, and a
        BotFather privacy URL. No registration, durable update ledger,
        paid-channel link, scheduler, retry queue, or outbound sender is claimed.
      </p>
      <p>
        Telegram and the Vercel-hosted route process the bounded identifiers and
        command needed to answer. The preview creates no application record, but
        provider records and infrastructure logs can still exist. Read the{" "}
        <Link href="/privacy#prism-signals-telegram">
          Telegram preview privacy notice
        </Link>
        ; persistence, account linking, payment, profiling, or outbound alerts
        require a fresh lawful-basis and privacy review.
      </p>

      <h2>What a standalone MVP may extract</h2>
      <p>
        The extraction unit is the product door: PRISM brand and terms, the
        versioned offer, generic product-flow contracts, the public
        opportunity-signal parser/projector, and channel adapters that enforce
        the same access decision.
      </p>
      <p>
        It is not the storefront database, raw price history, source
        credentials, seller identity, marketplace URLs, or the private
        engine&apos;s weights, mappings, thresholds, and outcome corpus. The
        purpose-specific rights decision stays bound to its evidence inside a
        trusted server boundary. Payment and delivery adapters remain
        channel-specific.
      </p>
      <p>
        Later products can reuse the sequence—versioned offer → verified
        provider evidence → bounded entitlement → channel-specific delivery—
        without inheriting PRISM&apos;s trade secret. Each product still owns
        its rights purpose, terms, price evidence, refund behavior, and
        delivery adapter.
      </p>

      <h2>What remains closed before sale</h2>
      <ol>
        {LAUNCH_GATES.map((gate) => (
          <li key={gate}>{gate}</li>
        ))}
      </ol>
      <p>
        Provider-policy, consumer-terms, tax, privacy, payment-support, and
        operational review are also required before activating Stripe,
        Telegram Stars, PayPal, or crypto. Until then: <strong>{PRISM_SIGNALS_PREVIEW_NOTICE}</strong>.
        There is no durable entitlement, accepted payment, or promised
        delivery.
      </p>

      <h2>Change history</h2>
      <p>
        <em>
          v1 — 2026-09-02. Published the branded preview, reusable product-flow
          boundary, channel-specific future rails, extraction seam, and closed
          launch gates. No live product was activated.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="PRISM MVP test — branded web and Telegram readings around separate rights, payment, entitlement, and delivery gates"
        doctrines={["substrate-honesty", "transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/prism-signals", href: "/prism-signals" },
          { label: "preview terms", href: "/prism-signals/terms" },
          {
            label: "opportunity signals",
            href: "/methodology/opportunity-signals",
          },
          { label: "all methodology", href: "/methodology" },
        ]}
      />
    </>
  );
}
