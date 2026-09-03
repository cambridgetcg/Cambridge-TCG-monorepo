import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/realms";
import { Audience, audienceMetadata } from "@/lib/ui";
import CheckoutReturnStatus from "./CheckoutReturnStatus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "PRISM Signals Stripe sandbox return",
  description:
    "A non-granting return surface that reads the latest owner-scoped PRISM entitlement status.",
  robots: { index: false, follow: false, nocache: true },
  other: audienceMetadata("consumer", [
    "trader",
    "account",
    "stripe-test-return",
  ]),
};

export default async function PrismSignalsCheckoutReturnPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?return=/prism-signals/checkout/return");

  return (
    <main className="min-h-screen bg-page text-ink">
      <Audience kind="consumer" contexts={["trader", "account", "stripe-test-return"]} />
      <header className="border-b border-border-subtle bg-surface-elevated">
        <div className="mx-auto max-w-5xl px-5 py-14 md:px-8 md:py-18">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-accent">
            PRISM Signals · Stripe sandbox return
          </p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight md:text-5xl">
            A return is not an access grant.
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-ink-muted">
            This page ignores Checkout identifiers and payment claims in the
            URL. It reads only your authenticated owner projection; a valid
            signed Stripe webhook remains the authority for All test access.
          </p>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
        <CheckoutReturnStatus />
      </section>
    </main>
  );
}
