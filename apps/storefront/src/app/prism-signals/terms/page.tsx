import type { Metadata } from "next";
import Link from "next/link";
import { Audience, audienceMetadata } from "@/lib/ui";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_NON_CLAIMS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_TELEGRAM_COMMANDS,
  PRISM_TELEGRAM_PREVIEW_START,
} from "@/lib/prism-signals/presentation";

export const metadata: Metadata = {
  title: "PRISM Signals preview and Stripe sandbox terms",
  description:
    "The Free preview, test-only Stripe All boundary, refusals, channel rules, and support path for PRISM Signals.",
  other: audienceMetadata("public-documentation", [
    "trader",
    "terms",
    "product-preview",
  ]),
};

export default function PrismSignalsPreviewTermsPage() {
  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="public-documentation" contexts={["trader", "terms"]} />
      <div className="mx-auto max-w-3xl px-5 py-16 md:px-8 md:py-20">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
          {PRISM_SIGNALS_BRAND.name} · preview and sandbox terms · 3 September 2026
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold">
          Free preview; Stripe sandbox, not a purchase
        </h1>
        <p className="mt-5 rounded-lg border border-border-strong bg-surface px-4 py-3 font-mono text-xs uppercase tracking-wide text-ink-muted">
          {PRISM_SIGNALS_PREVIEW_NOTICE}
        </p>

        <div className="mt-10 space-y-10 text-base leading-7 text-ink-muted">
          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">What this preview is</h2>
            <p className="mt-3">
              A fixed synthetic demonstration of how a future decision-support
              product could communicate a potential deal and its limitations.
              It does not query a marketplace, private engine, subscriber
              archive, or Telegram account. The public Free reading needs no
              payment or entitlement.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">No live purchase contract</h2>
            <p className="mt-3">
              Free has no price. A separately labelled All sandbox may use a
              £5 monthly <strong className="text-ink">test amount</strong> to
              rehearse Stripe Checkout, renewal, cancellation, failure, and
              refund handling. It accepts Stripe test mode and test payment
              methods only: it cannot make a real charge, issue a tax invoice,
              buy a live service, or create a production entitlement.
              This first sandbox is card-test only; delayed payment methods,
              trials, discounts and promotion codes are not offered.
            </p>
            <p className="mt-3">
              A successful test invoice can create a time-bounded, All-labelled
              owner projection around the fixed public synthetic fixture. It
              does not gate a unique signal payload or remove that fixture from
              Free. The amount is not a live commercial price, offer, trial,
              discount, VAT decision, service-level commitment, or promise that
              a live product will open. A live launch needs a new version of the
              offer and terms.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">Stripe sandbox boundary</h2>
            <p className="mt-3">
              New sandbox Checkout is available only when Cambridge explicitly
              enables its separate test-intake posture and every dedicated
              Stripe test credential, Price, Product, webhook, reference secret,
              and portal configuration agrees. Missing or drifting configuration
              means unavailable. Pausing new Checkout does not remove an
              existing test period or its status and cancellation paths.
            </p>
            <p className="mt-3">
              Checkout also requires both an active beta-interest request and a
              separate operator-issued, active, unexpired sandbox invitation.
              Interest is not an invitation; neither record is a purchase or
              grants access. There is no public endpoint for creating an
              invitation.
            </p>
            <p className="mt-3">
              Checkout creation and its return page never grant access. Only a
              correctly signed, non-live Stripe <code className="font-mono text-sm text-ink">invoice.paid</code>
              event bound to the exact local account attempt, monthly GBP test
              Price, subscription, and period can activate or renew the
              synthetic entitlement. Duplicate and out-of-order events are
              deduplicated or held for review rather than guessed into access.
            </p>
            <p className="mt-3">
              The dedicated test portal may show test invoices, repair a test
              payment method, and schedule cancellation at period end. It does
              not offer plan switching. Scheduled cancellation preserves the
              already-confirmed test period; effective deletion ends it. Only a
              full refund of the latest confirmed period may end access early.
              Refund and subscription cancellation are separate Stripe facts:
              after a full refund, Cambridge records a cancellation obligation
              and blocks any later invoice from restoring access until a signed
              terminal subscription event resolves it.
            </p>
            <p className="mt-3">
              Stripe&apos;s hosted page receives the test customer, billing, and
              payment details entered there. Cambridge sends only a fixed
              sandbox marker and random attempt reference in metadata—not its
              user id, account email, entitlement reference, or internal scope.
              The signed webhook transiently parses the event, which can include
              the test customer details supplied to Stripe, and retains a digest
              rather than the full event payload.
              Read the <Link href="/privacy" className="text-accent underline underline-offset-4">privacy notice</Link>
              for the provider and local-record boundary.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">Telegram boundary</h2>
            <p className="mt-3">
              The test webhook can answer a small allowlisted command set only
              when its server-side fixture mode and Telegram webhook secret are
              configured and an operator attests that the bot is new,
              invoice-free, has dropped pending updates, and has its privacy URL
              wired. Telegram and Cambridge TCG&apos;s Vercel-hosted route process
              the bounded update needed to answer, including Telegram/user and
              private-chat identifiers and command text; Cambridge stores no
              application update, account link, entitlement, or payment record,
              while provider infrastructure logs and Telegram&apos;s own records can
              still exist. Read the{" "}
              <Link
                href={PRISM_SIGNALS_LINKS.privacy.path}
                className="text-accent underline underline-offset-4"
              >
                detailed Telegram preview privacy notice
              </Link>
              . Any future digital purchase completed inside Telegram must use
              Telegram Stars and verified payment evidence; an external web rail
              is not smuggled into the bot.
            </p>
            <p className="mt-3">
              Pre-checkout is rejected. If a payment or refund update reaches
              this non-payment preview anyway, the route returns a retryable
              non-success response instead of acknowledging, discarding, or
              pretending it can fulfil the provider receipt. Do not connect the
              preview to a bot with invoice or payment history.
            </p>
            <p className="mt-3">
              The exact private-chat command allowlist is{" "}
              <code className="font-mono text-sm text-ink">
                {PRISM_SIGNALS_TELEGRAM_COMMANDS.join(", ")}
              </code>
              . The deep-link command replies only to{" "}
              <code className="font-mono text-sm text-ink">
                /start {PRISM_TELEGRAM_PREVIEW_START}
              </code>
              . Other text, commands, and start parameters receive no reply.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">The signal&apos;s refusals</h2>
            <ul className="mt-4 space-y-2">
              {PRISM_SIGNALS_NON_CLAIMS.map((claim) => (
                <li key={claim} className="border-l-2 border-border-strong pl-4">
                  {claim}
                </li>
              ))}
            </ul>
            <p className="mt-4">
              A potential-deal label is not guaranteed arbitrage. Confidence is
              evidence quality, not profit probability. Liquidity may remain
              unknown. Availability, condition, authenticity, fees, tax,
              shipping, and time to sell can differ from any evidence later
              admitted by a live product.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">Data rights stay upstream</h2>
            <p className="mt-3">
              Payment, transformation, secrecy, and channel access do not create
              permission to use or redistribute source data. No real evidence
              enters until a purpose-specific decision permits
              <code className="mx-1 font-mono text-sm text-ink">subscriber_derived_signal</code>
              for that evidence bundle.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">Support and next reading</h2>
            <p className="mt-3">
              Questions about the preview belong with Cambridge TCG, not
              Telegram or Stripe. Use the
              <Link href={PRISM_SIGNALS_LINKS.support.path} className="mx-1 text-accent underline underline-offset-4">contact page</Link>
              or read the
              <Link href={PRISM_SIGNALS_LINKS.methodology.path} className="mx-1 text-accent underline underline-offset-4">product-flow methodology</Link>.
            </p>
          </section>
        </div>

        <div className="mt-12 border-t border-border-subtle pt-6">
          <Link href={PRISM_SIGNALS_LINKS.product.path} className="text-sm font-semibold text-accent underline underline-offset-4">
            Return to the PRISM Signals preview
          </Link>
        </div>
      </div>
    </main>
  );
}
