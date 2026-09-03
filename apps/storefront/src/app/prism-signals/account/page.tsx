import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/realms";
import { Audience, audienceMetadata } from "@/lib/ui";
import { PRISM_SIGNALS_BRAND } from "@/lib/prism-signals/presentation";
import PrismSubscriptionAccount from "./PrismSubscriptionAccount";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PRISM Signals Free / All sandbox account",
  description:
    "Owner-scoped PRISM Signals plan, access, Checkout, and cancellation status for the Stripe sandbox test.",
  robots: { index: false, follow: false, nocache: true },
  other: audienceMetadata("consumer", ["trader", "account", "stripe-test"]),
};

export default async function PrismSignalsAccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?return=/prism-signals/account");

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trader", "account", "stripe-test"]} />
      <header className="border-b border-border-subtle bg-surface-elevated">
        <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-18">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            {PRISM_SIGNALS_BRAND.byline} · owner account
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            Free / All sandbox
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted">
            Inspect the latest owner-scoped status before starting or managing
            an All test subscription. Every control stays locked until that
            read succeeds.
          </p>
          <div className="mt-6 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 font-mono text-xs uppercase tracking-wide text-ink-muted">
            Stripe test mode · no real charge · no live market signal access
          </div>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
        <PrismSubscriptionAccount />
      </section>
    </main>
  );
}
