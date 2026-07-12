/**
 * /account/b2b/checkout — new-purchase availability status.
 *
 * The B2B layout provides the account/role gate. This page performs no cart,
 * catalog, price, stock-reservation, or Stripe work while the shared purchase
 * boundary is closed.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { B2B_PURCHASE_AVAILABILITY } from "@/lib/b2b/purchase-availability";

export const metadata: Metadata = {
  title: "Wholesale checkout paused — Cambridge TCG",
  description:
    "New B2B pricing, stock reservation, and Stripe checkout are paused.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "checkout"]),
};

export default async function B2BCheckoutPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Checkout paused"
        description={B2B_PURCHASE_AVAILABILITY.reason}
      />

      <Link
        href="/account/b2b/cart"
        className="inline-block text-sm text-ink-muted hover:text-accent"
      >
        ← Back to cart
      </Link>

      <Card>
        <div className="space-y-2 text-sm text-ink-muted">
          <h2 className="text-lg font-semibold text-ink">No payment action is available</h2>
          <p>
            This request did not read a cart or price, reserve stock, or create
            a Stripe session. Existing cart rows can be reviewed or removed on
            the cart page. Completed orders and their paid amounts remain in
            order history.
          </p>
        </div>
      </Card>
    </div>
  );
}
