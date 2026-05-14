/**
 * /account/b2b/orders — placeholder for order history (Phase 2.2c).
 *
 * Phase 2.2b ships Stripe payment but not yet the webhook-side order
 * recording. Until Phase 2.2c lands, this page is a substrate-honest
 * placeholder pointing to Stripe as the authoritative record.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";

export const metadata: Metadata = {
  title: "Wholesale orders — Cambridge TCG",
  description: "Your B2B order history (Phase 2.2c — coming soon).",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "orders"]),
};

export default function B2BOrdersPage() {
  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Orders"
        description="Your wholesale order history."
      />

      <Card>
        <div className="space-y-3 text-sm text-neutral-400">
          <p className="font-medium text-neutral-200">Order history rolling out in Phase 2.2c</p>
          <p>
            Until then, your Stripe receipts (emailed to you at checkout) are the
            authoritative record of each order. Cambridge TCG operators have
            access to every B2B order via the admin console; ask us at{" "}
            <a
              href="mailto:contact@cambridgetcg.com"
              className="text-amber-400 hover:underline"
            >
              contact@cambridgetcg.com
            </a>{" "}
            if you need a copy of any order details before this page goes live.
          </p>
          <p>
            Cart history (for orders placed before Phase 2.2b) still lives on{" "}
            <a
              href="https://wholesaletcgdirect.com"
              className="text-amber-400 hover:underline"
            >
              wholesaletcgdirect.com
            </a>{" "}
            until the legacy retirement (Phase 4).
          </p>
        </div>
      </Card>

      <div className="flex gap-3">
        <Link
          href="/account/b2b/catalog"
          className="rounded bg-amber-500 px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-amber-400"
        >
          Browse catalog
        </Link>
      </div>
    </div>
  );
}
