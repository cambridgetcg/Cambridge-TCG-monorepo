/** The retired checkout stays as a signpost to existing records. */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "New checkout is retired — Cambridge TCG",
  description:
    "New paid orders and checkout are retired. Existing order records and support remain available.",
};

export default function CheckoutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-3xl font-display font-semibold text-ink mb-4">
        New checkout is retired
      </h1>
      <p className="text-ink-muted mb-2">
        New paid orders and checkout are retired. Your existing order history,
        settlement, cancellation and refund paths remain available.
      </p>
      <p className="text-sm text-ink-faint mb-3">
        Explore the catalogue and market records at your own pace.
      </p>
      <p className="font-display italic text-ink-faint mb-8">
        Understanding needs no purchase.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/market"
          className="inline-block px-6 py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition"
        >
          Explore market records &rarr;
        </Link>
        <Link
          href="/account/orders"
          className="inline-block px-6 py-3 border border-border-subtle text-ink font-medium rounded-lg hover:border-border-strong transition"
        >
          Your past orders
        </Link>
      </div>
    </div>
  );
}
