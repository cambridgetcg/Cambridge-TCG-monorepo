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
  title: "PRISM Signals preview terms",
  description:
    "The test-only boundary, refusals, channel rules, and support path for the PRISM Signals synthetic preview.",
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
          {PRISM_SIGNALS_BRAND.name} · preview terms · 2 September 2026
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold">Nothing is for sale on this page</h1>
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
              archive, account, payment provider, or Telegram account.
            </p>
          </section>

          <section>
            <h2 className="font-display text-2xl font-semibold text-ink">No purchase contract</h2>
            <p className="mt-3">
              There is no price, checkout, trial, renewal, entitlement, paid
              channel, refund balance, or service-level commitment in this
              preview. Pressing a link cannot create a subscription. A future
              paid pilot needs separate reviewed commercial terms, support,
              cancellation, tax, refund, and delivery controls before it opens.
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
              Telegram or a payment provider. Use the
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
