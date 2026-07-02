/**
 * /account/b2b/checkout — final review before Stripe redirect.
 *
 * Loads the cart, shows a clean summary (item count + total at the
 * current wholesale price), and a Pay button that triggers the
 * Stripe Checkout Session creation. The button is the only place
 * where the buyer takes irreversible action; this page exists so
 * the buyer can see "I am about to pay £X" before being thrown to
 * Stripe.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/realms";
import { loadCartRows } from "@/lib/b2b/cart";
import { fetchCard } from "@/lib/wholesale/client";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";
import { PayButton } from "./_client";

export const metadata: Metadata = {
  title: "Wholesale checkout — Cambridge TCG",
  description: "Final review before paying via Stripe.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "checkout"]),
};

export default async function B2BCheckoutPage() {
  const user = await getSessionUser();
  const rows = await loadCartRows(user!.id);

  if (rows.length === 0) {
    redirect("/account/b2b/cart");
  }

  // Resolve prices for the summary. We do it here AND in startCheckout()
  // — substrate-honestly, the second resolution at action time is the
  // authoritative one. This summary may differ by a few seconds if a
  // price tick happens mid-page.
  const lines = await Promise.all(
    rows.map(async (r) => {
      const card = await fetchCard(r.sku, "wholesale");
      const unit = card ? card.channel_price ?? card.price_gbp : 0;
      return {
        sku: r.sku,
        quantity: r.quantity,
        displayName: card?.name_en || card?.name || r.sku,
        unit,
        lineTotal: unit * r.quantity,
        outOfStock: card ? card.stock < r.quantity : true,
        missing: !card,
      };
    }),
  );

  const total = lines.reduce((sum, l) => sum + l.lineTotal, 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const blocked = lines.some((l) => l.missing);

  return (
    <div className="space-y-6 max-w-2xl">
      <PageHeader
        title="Checkout"
        description={`Pay ${formatPrice(total)} for ${itemCount} item${itemCount === 1 ? "" : "s"} via Stripe.`}
      />

      <Link
        href="/account/b2b/cart"
        className="inline-block text-sm text-ink-muted hover:text-accent-strong"
      >
        ← Back to cart
      </Link>

      <Card>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Order summary</h2>
          <ul className="space-y-1 text-sm">
            {lines.map((l) => (
              <li
                key={l.sku}
                className={
                  "flex items-baseline justify-between gap-3 " +
                  (l.missing ? "text-red-400" : "")
                }
              >
                <span className="truncate">
                  {l.displayName}
                  <span className="text-ink-faint"> × {l.quantity}</span>
                  {l.outOfStock && !l.missing && (
                    <span className="ml-2 text-xs text-accent">stock-short</span>
                  )}
                  {l.missing && <span className="ml-2 text-xs">unavailable</span>}
                </span>
                <span className="font-mono whitespace-nowrap">
                  {l.missing ? "—" : formatPrice(l.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex items-baseline justify-between gap-3 border-t border-border-subtle pt-3">
            <span className="text-sm uppercase tracking-wider text-ink-faint">Total</span>
            <span className="text-2xl font-bold text-ink">{formatPrice(total)}</span>
          </div>
        </div>
      </Card>

      <Card>
        <PayButton disabled={blocked} />
        {blocked && (
          <p className="mt-3 text-sm text-red-400">
            One or more cards are no longer in the catalog. Return to the cart and remove
            them before checking out.
          </p>
        )}
      </Card>
    </div>
  );
}
