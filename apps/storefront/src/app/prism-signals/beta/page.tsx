import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/realms";
import { Audience, audienceMetadata } from "@/lib/ui";
import { PRISM_SIGNALS_BRAND } from "@/lib/prism-signals/presentation";
import { prismSignalsBetaIntakeEnabled } from "@/lib/prism-signals/beta-interest-config.server";
import BetaInterestForm from "./BetaInterestForm";

export const dynamic = "force-dynamic";

export function generateMetadata(): Metadata {
  const intakeEnabled = prismSignalsBetaIntakeEnabled();
  return {
    title: intakeEnabled
      ? "PRISM Signals closed-beta interest"
      : "Manage an existing PRISM Signals beta request",
    description: intakeEnabled
      ? "Signed-in Cambridge TCG account holders can record or withdraw a revocable PRISM Signals closed-beta contact request."
      : "Signed-in Cambridge TCG account holders can inspect or withdraw an existing PRISM Signals beta request while new intake is paused.",
    robots: { index: false, follow: false, nocache: true },
    other: audienceMetadata("consumer", [
      "trader",
      "closed-beta",
      "product-interest",
    ]),
  };
}

export default async function PrismSignalsBetaPage() {
  const intakeEnabled = prismSignalsBetaIntakeEnabled();
  const user = await getSessionUser();
  if (!user) redirect("/login?return=/prism-signals/beta");

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trader", "closed-beta"]} />
      <section className="border-b border-border-subtle bg-surface-elevated">
        <div className="mx-auto max-w-5xl px-5 py-16 md:px-8 md:py-20">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            {PRISM_SIGNALS_BRAND.byline} · closed beta
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-semibold tracking-tight md:text-5xl">
            {intakeEnabled
              ? "Record interest. Nothing else starts."
              : "Manage an existing beta request."}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted">
            {intakeEnabled
              ? "This signed-in page records a revocable request to hear only about a PRISM Signals beta invitation or status. It is not a sale, subscription, trial, invitation, queue position, access grant, or promise that a beta will open."
              : "New interest intake is paused. This signed-in management page still lets you inspect and delete an existing request. Pausing intake does not suspend withdrawal or retention."}
          </p>
          <div className="mt-6 rounded-lg border border-border-strong bg-surface px-4 py-3 font-mono text-xs uppercase tracking-wide text-ink-muted">
            {intakeEnabled
              ? "Closed-beta interest · no price · no payment · no live signal access"
              : "Intake paused · owner status and withdrawal remain available"}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
        <BetaInterestForm intakeEnabled={intakeEnabled} />

        <div className="mt-10 grid gap-5 border-t border-border-subtle pt-8 text-sm leading-6 text-ink-muted md:grid-cols-3">
          <div>
            <h2 className="font-semibold text-ink">What is stored</h2>
            <p className="mt-2">
              Existing account ID, product ID, one or two channel preferences,
              contact-wording version, and request/update/expiry times.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-ink">What is not stored here</h2>
            <p className="mt-2">
              No copied email address, Telegram identity, card data, price,
              payment, entitlement, marketing preference, or queue rank.
            </p>
          </div>
          <div>
            <h2 className="font-semibold text-ink">How contact works</h2>
            <p className="mt-2">
              Cambridge TCG may use the signed-in account email only for the
              requested PRISM beta invitation or status contact. A Telegram
              preference alone never permits Telegram outreach.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
