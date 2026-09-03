import type { Metadata } from "next";
import Link from "next/link";
import { Audience, TypeSignature, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "PRISM Signals product flow",
  description:
    "How the PRISM Signals preview and closed-beta spine separate interest, source rights, private scoring, payment evidence, entitlement, and channel delivery.",
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
  "The durable event and snapshot store passes deployed-adapter conformance and gains reconciliation plus account/channel binding.",
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
        <strong>Current boundary — 3 September 2026.</strong> Free is the public
        synthetic preview. A separately gated All sandbox can rehearse a £5
        monthly Stripe test subscription to the same fixed fixture. There is no
        live offer or price, real charge, production source-rights decision,
        production signal feed, or outbound signal delivery.
      </blockquote>

      <p>
        You can inspect the branded test at{" "}
        <Link href="/prism-signals">/prism-signals</Link> and its plain-language{" "}
        <Link href="/prism-signals/terms">preview terms</Link>. Visiting either
        page creates no account, order, subscription, reservation, or access.
        Signed-in account holders may separately open the{" "}
        <Link href="/prism-signals/beta">closed-beta-interest page</Link>; that
        request is not access or a purchase.
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

      <h2>Beta interest is a separate, revocable fact</h2>
      <p>
        The beta page stores only the existing account id, product id, bounded
        web/Telegram preferences, consent-wording version, and request, update,
        and expiry times. Its checkbox starts unticked and specifically asks
        Cambridge TCG to store the request and use the account email only for a
        PRISM beta invitation or status contact. It is not general marketing
        consent; a Telegram preference neither supplies a Telegram identity nor
        permits a bot message.
      </p>
      <p>
        The owner can inspect the bounded state and delete the complete row
        without penalty. A new affirmative submission is required to update it
        or refresh its 180-day expiry. A daily authenticated sweep deletes
        expired or superseded-wording rows. The new-intake posture is exactly
        <code> PRISM_SIGNALS_BETA_MODE=closed-beta-v1</code>. Without it the
        public request invitation is hidden and POST is unavailable, while the
        signed-in management page, owner GET/DELETE, and retention sweep remain
        available so existing consent cannot be stranded.
      </p>
      <p>
        Once a beta-interest row exists, rollback means pausing new intake
        while this management and retention release stays live. Removing owner
        GET/DELETE or the retention cron requires a prior complete purge or an
        equivalent withdrawal and expiry procedure.
      </p>

      <h2>Free and All are separate test meanings</h2>
      <p>
        <strong>Free</strong> is the existing public synthetic preview. It
        creates no Stripe customer or entitlement. <strong>All</strong> is a
        separate <code>prism-signals-all</code> v1 test offer. When every
        dedicated sandbox guard agrees, an owner with both active beta interest
        and a separate operator-issued, active, unexpired sandbox invitation can
        use a £5 monthly test amount to rehearse Checkout and a time-bounded
        All-labelled owner projection around the same public synthetic fixture.
        It gates no unique payload. Interest is not an invitation; neither fact
        grants access.
      </p>
      <p>
        The £5 value is not a live commercial price. Yu chose the Free/All
        shape after referencing ShibbySays; the creator&apos;s current public
        Patreon actually lists a larger cumulative USD ladder, so Cambridge
        does not attribute this two-tier GBP catalogue to them. A production
        price, tax treatment and consumer contract need a later offer version.
      </p>
      <p>
        All is test/test, web-only, and grants only the narrow
        <code> synthetic_fixture_delivery</code> purpose. It cannot open the
        still-unevaluated <code>subscriber_derived_signal</code> purpose, a live
        source, private scorer, real card, listing, alert or trade action. New
        Checkout intake is a separate switch; pausing it leaves existing test
        status, access, webhook processing and cancellation available.
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
            <td>Optional sandbox; £5 monthly test amount, no live charge</td>
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
        Stripe is the test rail for the independent web sandbox. A digital
        product bought and fulfilled inside Telegram still uses Telegram Stars
        only, subject to a fresh review before activation. PayPal and crypto
        remain web-only candidates and are not accepted here.
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
      <h2>The runtime makes provider disorder explicit</h2>
      <p>
        <code>@cambridge-tcg/product-flow-runtime</code> composes the pure
        reducer with a lock-first transaction contract, in-memory reference
        store, provider normalizers, and adapter conformance suite. The
        storefront&apos;s thin Postgres adapter reuses its existing persistent
        transaction pool. Its additive schema separates append-only canonical
        events from current entitlement snapshots.
      </p>
      <p>
        The entitlement scope is locked before event allocation. Event id,
        provider-event ref, and rail/payment grant identity are unique within
        an environment. Exact duplicate provider Events return the stored
        canonical event; conflicting reuse—including one payment aimed at two
        entitlements—rolls back. A callback that would newly make a healthy
        projection terminally blocked also rolls back for reconciliation, so a
        delayed provider event cannot permanently erase valid access.
      </p>
      <p>
        Refunds bind to the latest/current confirmed payment. Refunding an
        older billing period cannot cancel a newer paid period, and a partial
        Stripe refund is not treated as complete entitlement reversal. Stripe
        and Telegram Stars are normalizer-only capabilities for facts a host
        has already authenticated and mapped. PayPal and crypto remain disabled.
      </p>
      <p>
        In the dedicated Stripe host, a full latest-period refund creates a
        durable <code>cancel_subscription</code> reconciliation obligation.
        Refund and subscription cancellation are separate provider facts: the
        obligation blocks later invoice grants and account erasure until a
        signed terminal subscription event resolves it. A refund arriving
        before its paid event terminalizes the ungranted generation without
        fabricating a confirmed payment or a generic refund of access that
        never existed.
      </p>
      <p>
        A dedicated PRISM Stripe sandbox can now consume the runtime when every
        test-only guard is configured. Its Checkout reserves an owner-bound
        attempt; a separate raw-body webhook verifies its own Stripe signature,
        rejects live events, and maps provider ids locally before the generic
        runtime sees only opaque references. A return, bot link, synthetic
        reply, reload, beta request, or Checkout completion creates no access.
      </p>
      <p>
        Only an exact signed <code>invoice.paid</code> event bound to the local
        attempt, subscription, active GBP monthly test Price and period can
        confirm or renew All. Binding, receipt, invoice grant, canonical event
        and snapshot commit in one Postgres transaction. Provider evidence
        keeps Stripe&apos;s true semantic instant; a host projection timestamp is
        allocated under the entitlement lock so equal-second callbacks cannot
        corrupt the reducer&apos;s millisecond cursor.
      </p>
      <p>
        Renewal extends paid-through time but does not prove a scheduled
        cancellation was withdrawn. The snapshot preserves that flag until a
        separately verified <code>subscription_resumed</code> provider-status
        event clears it. Resume is rejected for ended or refunded access. A
        remotely attested cancel/resume state that accompanies invoice repair is
        projected after the grant in the same transaction, not silently written
        only to a provider mirror.
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
        The extraction unit now starts with
        <code> @cambridge-tcg/prism-signals-core</code>: PRISM brand and
        host-bound links/privacy copy, versioned preview offer, strict public
        signal presentation, and pure Telegram planner. It composes with the
        generic product-flow contracts, framework-neutral runtime, public
        opportunity-signal parser/projector, and channel hosts that enforce the
        same access decision.
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
      <p>
        The PRISM package is currently unpublished workspace TypeScript in this
        public monorepo, not an independently published artifact. Compiled output, an explicit package
        file allowlist, tarball inspection, and a clean-consumer install/run
        smoke remain gates before a separate repository or npm release.
      </p>

      <h2>What remains closed before sale</h2>
      <ol>
        {LAUNCH_GATES.map((gate) => (
          <li key={gate}>{gate}</li>
        ))}
      </ol>
      <p>
        Provider-policy, consumer-terms, tax, privacy, payment-support, and
        operational review are also required before any live Stripe,
        Telegram Stars, PayPal, or crypto activation. Until then: Free synthetic
        preview, optional Stripe test mode, no live market data, and no real
        payment. A sandbox entitlement marks only an owner projection around
        the fixed public fixture and gates no unique payload. Beta interest
        alone changes none of those facts.
      </p>

      <h2>Change history</h2>
      <p>
        <em>
          v1 — 2026-09-02. Published the branded preview, reusable product-flow
          boundary, channel-specific future rails, extraction seam, and closed
          launch gates. No live product was activated.
        </em>
      </p>
      <p>
        <em>
          v2 — 2026-09-02. Added the unpublished workspace extraction package, revocable
          closed-beta interest with bounded retention, atomic runtime and
          durable schema, current-grant refund binding, and pure Stripe/Stars
          normalizers. No payment or live signal was activated.
        </em>
      </p>
      <p>
        <em>
          v3 — 2026-09-03. Added the Free/All catalogue and dedicated Stripe
          sandbox host. The £5 amount and owner projection are test-only; no
          live key, real charge, production price, production source-rights
          decision or live signal was activated.
        </em>
      </p>

      <TypeSignature
        type="methodology-page"
        origin="PRISM MVP test — branded web and Telegram readings around separate rights, payment, entitlement, and delivery gates"
        doctrines={["substrate-honesty", "transparency", "meaning", "creation"]}
        audience="public-documentation"
        recursion={[
          { label: "/prism-signals", href: "/prism-signals" },
          { label: "closed-beta interest", href: "/prism-signals/beta" },
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
