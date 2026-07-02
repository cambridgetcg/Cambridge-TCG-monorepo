/**
 * /account/b2b/checkout/success — Stripe redirect destination after
 * successful payment.
 *
 * Stripe redirects here with ?session_id=cs_... in the URL. The
 * webhook handles the actual order recording asynchronously; this
 * page just confirms to the buyer that the payment cleared and
 * points them to /account/b2b/orders for follow-up (Phase 2.2c).
 *
 * Note: at this moment (Phase 2.2b), the webhook does NOT yet write
 * a B2B order row — that's Phase 2.2c. The Stripe dashboard is the
 * authoritative record until the webhook lands. This page is honest
 * about that gap.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { clearB2BCart } from "../../cart/actions";

export const metadata: Metadata = {
  title: "Payment received — Wholesale — Cambridge TCG",
  description: "Stripe has confirmed your wholesale payment.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "checkout-success"]),
};

interface PageProps {
  searchParams: Promise<{ session_id?: string }>;
}

export default async function B2BCheckoutSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const sessionId = sp.session_id;

  // Clear the cart now that Stripe accepted the payment. The webhook
  // will commit the stock reservation independently — clearing the
  // cart here is purely UI hygiene so the next /account/b2b/cart
  // visit shows an empty cart instead of the just-paid lines.
  if (sessionId) {
    await clearB2BCart();
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Payment received"
        description="Stripe has confirmed your wholesale payment. We&rsquo;ll process the order shortly."
      />

      <Card>
        <div className="space-y-3 text-sm">
          <p className="text-secondary font-medium">✓ Stripe accepted your payment.</p>
          {sessionId && (
            <p className="text-ink-faint font-mono text-xs break-all">
              Session: {sessionId}
            </p>
          )}
          <p className="text-ink-muted">
            Our operations team has been notified. You&rsquo;ll receive a confirmation
            email when stock is allocated and the order is queued for fulfillment.
          </p>
        </div>
      </Card>

      <Card>
        <div className="space-y-2 text-sm text-ink-muted">
          <p className="font-medium text-ink">What happens next</p>
          <ul className="ml-5 list-disc space-y-1">
            <li>Stock is reserved at your name in the wholesale ledger.</li>
            <li>You&rsquo;ll get a confirmation email once the order is allocated.</li>
            <li>Tracking lands in your email when the package ships.</li>
            <li>
              Order history is rolling out in Phase 2.2c — meanwhile, your Stripe
              receipt is the authoritative record.
            </li>
          </ul>
        </div>
      </Card>

      <div className="flex gap-3">
        <Link
          href="/account/b2b/catalog"
          className="rounded border border-border-strong px-4 py-2 text-sm text-ink-muted hover:border-accent hover:text-accent-strong"
        >
          Browse more cards
        </Link>
        <Link
          href="/account/b2b/orders"
          className="rounded bg-accent px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-accent-strong"
        >
          View orders
        </Link>
      </div>
    </div>
  );
}
