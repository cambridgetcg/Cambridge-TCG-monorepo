import type { Metadata } from "next";
import Link from "next/link";
import { Audience, WhyLink, audienceMetadata } from "@/lib/ui";
import {
  PRISM_SIGNALS_BRAND,
  PRISM_SIGNALS_CHANNELS,
  PRISM_SIGNALS_FUTURE_RAILS,
  PRISM_SIGNALS_LINKS,
  PRISM_SIGNALS_NON_CLAIMS,
  PRISM_SIGNALS_PREVIEW_NOTICE,
  PRISM_SIGNALS_SYNTHETIC_CARD,
} from "@/lib/prism-signals/presentation";
import { prismSignalsRuntime } from "@/lib/prism-signals/runtime.server";
import { prismSignalsBetaIntakeEnabled } from "@/lib/prism-signals/beta-interest-config.server";
import {
  PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR,
  PRISM_SIGNALS_PLAN_CATALOG,
} from "@/lib/prism-signals/product";
import { prismStripeSandboxPublicPosture } from "@/lib/prism-signals/stripe/config.server";

export function generateMetadata(): Metadata {
  const intakeEnabled = prismSignalsBetaIntakeEnabled();
  return {
    title: intakeEnabled
      ? "PRISM Signals by Cambridge TCG — preview and closed beta"
      : "PRISM Signals by Cambridge TCG — synthetic preview",
    description: intakeEnabled
      ? "A synthetic PRISM Signals preview with a separate signed-in, revocable closed-beta interest request. No live data, payment, or access promise."
      : "A test-only, synthetic preview of PRISM Signals with coarse bands, evidence confidence, liquidity, and risks. No live data or payment.",
    other: audienceMetadata("consumer", [
      "trader",
      "decision-support",
      "product-preview",
    ]),
  };
}

function PrismMark() {
  return (
    <div aria-hidden="true" className="relative h-36 w-36 shrink-0">
      <div className="absolute inset-5 rotate-45 rounded-lg border border-border-strong bg-surface-elevated shadow-mat" />
      <div className="absolute inset-10 rotate-45 rounded-lg border border-accent bg-accent-wash" />
      <div className="absolute inset-[3.75rem] rotate-45 rounded-sm bg-accent" />
      <div className="absolute inset-x-0 top-1/2 border-t border-border-subtle" />
      <div className="absolute inset-y-0 left-1/2 border-l border-border-subtle" />
    </div>
  );
}

export default function PrismSignalsPage() {
  const { offer, telegram_href: telegramHref } = prismSignalsRuntime();
  const intakeEnabled = prismSignalsBetaIntakeEnabled();
  const stripePosture = prismStripeSandboxPublicPosture();

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trader", "product-preview"]} />

      <section className="border-b border-border-subtle">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-[1fr_auto] md:items-center md:px-8 md:py-24">
          <div>
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-ink-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" />
              {PRISM_SIGNALS_PREVIEW_NOTICE}
            </div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-ink-faint">
              {PRISM_SIGNALS_BRAND.byline}
            </p>
            <h1 className="mt-3 max-w-4xl font-display text-4xl font-semibold tracking-tight text-ink md:text-6xl">
              {PRISM_SIGNALS_BRAND.name}
            </h1>
            <p className="mt-5 max-w-2xl font-display text-2xl italic leading-snug text-ink-muted md:text-3xl">
              {PRISM_SIGNALS_BRAND.tagline}
            </p>
            <p className="mt-6 max-w-2xl text-base leading-7 text-ink-muted">
              A bounded decision-support product for traders deciding what to
              inspect next. It shows a potential-deal category together with
              evidence quality, liquidity, costs, expiry, and the reasons not to
              treat the signal as guaranteed arbitrage.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href="#synthetic-signal"
                className="rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-page transition hover:opacity-90"
              >
                Open the synthetic signal
              </a>
              {intakeEnabled ? (
                <Link
                  href="/prism-signals/beta"
                  className="rounded-lg border border-accent bg-accent-wash px-5 py-3 text-sm font-semibold text-accent transition hover:bg-surface"
                >
                  Request closed-beta consideration
                </Link>
              ) : (
                <Link
                  href="/prism-signals/beta"
                  className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface"
                >
                  Manage an existing beta request
                </Link>
              )}
              <Link
                href={PRISM_SIGNALS_LINKS.terms.path}
                className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface"
              >
                Read preview terms
              </Link>
              {telegramHref ? (
                <a
                  href={telegramHref}
                  rel="noopener noreferrer"
                  className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink transition hover:bg-surface"
                >
                  Open Telegram preview
                </a>
              ) : (
                <span className="rounded-lg border border-border-subtle bg-surface-subtle px-5 py-3 text-sm text-ink-faint">
                  Telegram preview not configured here
                </span>
              )}
            </div>
            {telegramHref ? (
              <p className="mt-4 max-w-2xl text-xs leading-5 text-ink-faint">
                Opening Telegram asks Telegram and Cambridge TCG&apos;s
                Vercel-hosted webhook to process your Telegram identifiers,
                private-chat id and bounded command/update long enough to reply.
                The preview stores no application record; provider access and
                security logs can still exist. Read the{" "}
                <Link
                  href={PRISM_SIGNALS_LINKS.privacy.path}
                  className="text-accent underline underline-offset-2"
                >
                  Telegram preview privacy notice
                </Link>
                .
              </p>
            ) : null}
          </div>
          <PrismMark />
        </div>
      </section>

      <section id="synthetic-signal" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-16 md:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Product experience test
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold">
              One signal, with its perimeter intact
            </h2>
          </div>
          <WhyLink href={PRISM_SIGNALS_LINKS.methodology.path} label="How this preview works" />
        </div>

        <article className="overflow-hidden rounded-xl border border-border-strong bg-surface shadow-mat">
          <header className="flex flex-col gap-5 border-b border-border-subtle bg-surface-elevated px-6 py-6 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                {PRISM_SIGNALS_SYNTHETIC_CARD.eyebrow}
              </p>
              <h3 className="mt-2 font-display text-2xl font-semibold">
                {PRISM_SIGNALS_SYNTHETIC_CARD.title}
              </h3>
              <p className="mt-1 text-sm text-ink-muted">
                {PRISM_SIGNALS_SYNTHETIC_CARD.descriptor}
              </p>
            </div>
            <div className="rounded-lg border border-accent bg-accent-wash px-4 py-3 md:max-w-xs">
              <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent">
                {PRISM_SIGNALS_SYNTHETIC_CARD.classification}
              </p>
              <p className="mt-2 text-sm leading-6 text-ink-muted">
                {PRISM_SIGNALS_SYNTHETIC_CARD.classificationNote}
              </p>
            </div>
          </header>

          <div className="grid gap-px bg-border-subtle sm:grid-cols-2 lg:grid-cols-5">
            {PRISM_SIGNALS_SYNTHETIC_CARD.bands.map((band) => (
              <div key={band.label} className="bg-surface px-5 py-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {band.label}
                </p>
                <p className="mt-3 font-mono text-base text-ink">{band.value}</p>
                <p className="mt-2 text-sm leading-5 text-ink-muted">{band.note}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-8 px-6 py-7 md:grid-cols-2">
            <div>
              <h4 className="font-display text-xl font-semibold">Risks attached</h4>
              <ul className="mt-4 space-y-3">
                {PRISM_SIGNALS_SYNTHETIC_CARD.risks.map((risk) => (
                  <li key={risk} className="flex gap-3 text-sm leading-6 text-ink-muted">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />
                    {risk}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-border-subtle bg-surface-subtle p-5">
              <h4 className="font-display text-xl font-semibold">What stayed behind</h4>
              <p className="mt-3 text-sm leading-6 text-ink-muted">
                {PRISM_SIGNALS_SYNTHETIC_CARD.boundary}
              </p>
              <p className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-faint">
                Fixed synthetic fixture · never refreshed
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="border-y border-border-subtle bg-surface-elevated">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            Free + All · test catalogue
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold">
            One free reading. One sandbox subscription test.
          </h2>
          <p className="mt-4 max-w-3xl leading-7 text-ink-muted">
            The plan names are fixed, but the commercial launch is not. All&apos;s
            £5 monthly figure is a Stripe test-mode amount used to verify the
            subscription flow—not a live price and not a real charge.
          </p>

          <div className="mt-9 grid gap-6 md:grid-cols-2">
            <article className="rounded-xl border border-border-strong bg-surface p-6 shadow-mat">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-faint">
                {PRISM_SIGNALS_PLAN_CATALOG.plans[0].name}
              </p>
              <p className="mt-3 font-display text-4xl font-semibold">£0</p>
              <p className="mt-4 text-sm leading-6 text-ink-muted">
                The public fixed synthetic signal already on this page. No
                account, Checkout session, payment event, or perpetual
                entitlement is manufactured for Free access.
              </p>
              <a
                href="#synthetic-signal"
                className="mt-6 inline-flex rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-ink"
              >
                Read the Free fixture
              </a>
            </article>

            <article className="rounded-xl border border-accent bg-accent-wash p-6 shadow-mat">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                    {PRISM_SIGNALS_PLAN_CATALOG.plans[1].name}
                  </p>
                  <p className="mt-3 font-display text-4xl font-semibold">
                    £{PRISM_SIGNALS_ALL_TEST_AMOUNT_MINOR / 100}
                    <span className="ml-2 text-base font-normal text-ink-muted">/ month</span>
                  </p>
                </div>
                <span className="rounded-full border border-warning/30 bg-warning/10 px-3 py-1 font-mono text-xs text-warning">
                  Sandbox only
                </span>
              </div>
              <p className="mt-4 text-sm leading-6 text-ink-muted">
                Tests recurring Stripe Checkout, signed webhook authority,
                owner status, and cancellation against an All-labelled
                owner projection around the same public synthetic fixture. It
                does not unlock an exclusive payload or live market signals.
              </p>
              <Link
                href="/prism-signals/account"
                className="mt-6 inline-flex rounded-lg bg-ink px-5 py-3 text-sm font-semibold text-page"
              >
                {stripePosture.checkout_available
                  ? "Open All sandbox account"
                  : "Check sandbox availability"}
              </Link>
              <p className="mt-3 text-xs leading-5 text-ink-faint">
                {stripePosture.checkout_available
                  ? "The host reports that sandbox intake is available. Your eligibility and owner state are still checked after sign-in; this link never creates Checkout directly."
                  : "New sandbox Checkout is paused or not configured. The account page remains available for owner status and existing-subscription management."}
              </p>
            </article>
          </div>

          <p className="mt-6 max-w-4xl font-mono text-xs leading-5 text-ink-faint">
            {PRISM_SIGNALS_PLAN_CATALOG.notice}
          </p>
        </div>
      </section>

      <section className="border-y border-border-subtle bg-surface-subtle">
        <div className="mx-auto max-w-6xl px-5 py-16 md:px-8">
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
            One product, two readings
          </p>
          <h2 className="mt-2 font-display text-3xl font-semibold">Web depth. Telegram brevity.</h2>
          <p className="mt-4 max-w-3xl leading-7 text-ink-muted">
            Both channels must carry the same meaning. Telegram may be shorter;
            it may not erase the risk block, turn confidence into probability,
            or turn a potential deal into an instruction.
          </p>
          <p className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-faint">
            {PRISM_SIGNALS_PREVIEW_NOTICE}
          </p>

          <div className="mt-9 grid gap-6 md:grid-cols-2">
            {PRISM_SIGNALS_CHANNELS.map((channel) => (
              <article key={channel.id} className="rounded-xl border border-border-subtle bg-surface p-6">
                <div className="flex items-center gap-3">
                  <span className="rounded border border-border-strong px-2 py-1 font-mono text-xs text-ink-muted">
                    {channel.shortLabel}
                  </span>
                  <p className="text-sm font-semibold text-ink">{channel.label}</p>
                </div>
                <h3 className="mt-5 font-display text-2xl font-semibold">{channel.headline}</h3>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{channel.body}</p>
                <ol className="mt-5 space-y-3">
                  {channel.steps.map((step, index) => (
                    <li key={step} className="flex gap-3 text-sm text-ink-muted">
                      <span className="font-mono text-ink-faint">0{index + 1}</span>
                      {step}
                    </li>
                  ))}
                </ol>
                <p className="mt-6 border-t border-border-subtle pt-4 font-mono text-xs text-ink-faint">
                  {channel.currentStatus}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16 md:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
              Repeatable product flow
            </p>
            <h2 className="mt-2 font-display text-3xl font-semibold">The first shell, not the last product</h2>
            <p className="mt-4 leading-7 text-ink-muted">
              A versioned offer, verified payment evidence, one entitlement,
              and channel-specific delivery are separate steps. Future products
              can reuse that sequence without inheriting PRISM&apos;s private model.
            </p>
            <p className="mt-4 font-mono text-xs uppercase tracking-wide text-ink-faint">
              {PRISM_SIGNALS_PREVIEW_NOTICE}
            </p>
            <div className="mt-6 rounded-lg border border-border-subtle bg-surface p-5 font-mono text-xs leading-6 text-ink-muted">
              offer → provider receipt → entitlement → web / Telegram
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-border-subtle bg-surface">
            {PRISM_SIGNALS_FUTURE_RAILS.map((rail, index) => (
              <div
                key={rail.rail}
                className={index === 0 ? "p-5" : "border-t border-border-subtle p-5"}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-ink">{rail.channel}</p>
                    <p className="mt-1 font-mono text-xs text-ink-faint">{rail.rail}</p>
                  </div>
                  <span className="rounded-full border border-border-subtle bg-surface-subtle px-3 py-1 font-mono text-xs text-ink-muted">
                    {rail.status}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-6 text-ink-muted">{rail.rule}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border-subtle bg-surface-elevated">
        {intakeEnabled ? (
          <div className="mx-auto max-w-6xl px-5 pt-14 md:px-8">
            <div className="grid gap-6 rounded-xl border border-accent bg-accent-wash p-6 md:grid-cols-[1fr_auto] md:items-center md:p-8">
              <div>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-accent">
                  Closed beta · interest only
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">
                  Ask to hear about a possible private test
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-muted">
                  Signed-in account holders can record a revocable request to
                  hear about a PRISM Signals beta invitation or status. It has
                  no price, payment, queue rank, guaranteed invitation, or
                  product access, and it does not switch on live signals.
                </p>
              </div>
              <Link
                href="/prism-signals/beta"
                className="rounded-lg bg-ink px-5 py-3 text-center text-sm font-semibold text-page transition hover:opacity-90"
              >
                Open the beta-interest page
              </Link>
            </div>
          </div>
        ) : null}
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-2 md:px-8">
          <div>
            <h2 className="font-display text-2xl font-semibold">The fixed refusals</h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              These travel with every final signal. A compact channel cannot
              bargain them away.
            </p>
          </div>
          <ul className="grid gap-3 sm:grid-cols-2">
            {PRISM_SIGNALS_NON_CLAIMS.map((claim) => (
              <li key={claim} className="rounded-lg border border-border-subtle bg-surface px-4 py-3 text-sm text-ink-muted">
                {claim}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-5 py-12 md:px-8">
        <div className="flex flex-col gap-5 rounded-xl border border-border-strong bg-surface p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-display text-xl font-semibold">Test the reading, not a trade.</p>
            <p className="mt-2 text-sm text-ink-muted">
              Offer {offer.id} v{offer.version} · {offer.environment} · {offer.status}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={PRISM_SIGNALS_LINKS.methodology.path} className="text-sm font-semibold text-accent underline underline-offset-4">
              Product-flow methodology
            </Link>
            <Link href={PRISM_SIGNALS_LINKS.signalMethodology.path} className="text-sm font-semibold text-accent underline underline-offset-4">
              Signal methodology
            </Link>
            <a href={PRISM_SIGNALS_LINKS.offer.path} className="text-sm font-semibold text-accent underline underline-offset-4">
              Product offer JSON
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
