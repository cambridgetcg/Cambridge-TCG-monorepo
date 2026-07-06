/**
 * /checkout — the shop's old till, kept as a signpost.
 *
 * Collectors-first (docs/decisions/2026-07-06-collectors-first.md):
 * retail checkout retired on 2026-07-06 with every past order completed
 * and nothing owed. The page stays as a 200 explainer rather than a
 * dead 404 — a bookmarked promise deserves a forwarding address, not
 * silence. New purchases happen collector-to-collector on the market.
 */

import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "The shop became a market — Cambridge TCG",
  description:
    "Cambridge TCG no longer sells cards directly. Buy from collectors on the peer-to-peer market instead.",
};

export default function CheckoutPage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <h1 className="text-3xl font-display font-semibold text-ink mb-4">
        The shop became a market
      </h1>
      <p className="text-ink-muted mb-2">
        Cambridge TCG stopped selling cards on 6 July 2026 — buy from collectors instead.
        Every past order was completed and honored; your order history is untouched.
      </p>
      <p className="text-sm text-ink-faint mb-8">
        Same cards, same escrow protection — the sellers are collectors now, not us.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/market"
          className="inline-block px-6 py-3 bg-ink text-page font-bold rounded-lg hover:opacity-90 transition"
        >
          Browse the collectors&apos; market &rarr;
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
