/**
 * /account/b2b/cart — the B2B shopping cart.
 *
 * Loads (sku, qty) rows from b2b_cart_items + re-resolves wholesale
 * prices from the Falcon at every render. The recompute is the
 * substrate-honesty stance: the buyer pays the *current* wholesale
 * price, not whatever it was at add-time. A row that's gone out of
 * stock between add and view shows stock=0 (visible warning); a row
 * whose price moved up or down shows the new price.
 *
 * Auth + role: gated by /account/b2b/layout.tsx via
 * requireWholesalePage(); this page trusts that gate and asserts on
 * the cached session.
 */

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { getSessionUser } from "@/lib/auth/realms";
import { fetchCard, cardAltText, type PriceItem } from "@/lib/wholesale/client";
import { loadCartRows } from "@/lib/b2b/cart";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";
import { QtyControl, RemoveButton, ClearButton } from "./_client";

export const metadata: Metadata = {
  title: "Wholesale cart — Cambridge TCG",
  description: "Your B2B cart. Wholesale prices recompute at every render and at checkout.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "cart"]),
};

interface CartLine {
  sku: string;
  quantity: number;
  card: PriceItem | null;
  unitPrice: number | null;
  lineTotal: number | null;
}

export default async function B2BCartPage() {
  const user = await getSessionUser();
  // Layout guarantees user != null.
  const rows = await loadCartRows(user!.id);

  // Resolve current wholesale prices in parallel. A missing card (404)
  // is kept as null — the row renders an "unavailable" line; the
  // operator can remove it manually.
  const lines: CartLine[] = await Promise.all(
    rows.map(async (r): Promise<CartLine> => {
      const card = await fetchCard(r.sku, "wholesale");
      const unit = card ? card.channel_price ?? card.price_gbp : null;
      return {
        sku: r.sku,
        quantity: r.quantity,
        card,
        unitPrice: unit,
        lineTotal: unit === null ? null : unit * r.quantity,
      };
    }),
  );

  const total = lines.reduce((sum, l) => sum + (l.lineTotal ?? 0), 0);
  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasOutOfStock = lines.some((l) => l.card && l.card.stock < l.quantity);
  const hasMissing = lines.some((l) => !l.card || l.unitPrice === null);

  if (lines.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Wholesale cart" description="Your cart is empty." />
        <Card>
          <div className="text-sm text-ink-muted space-y-3">
            <p>Nothing in your cart yet. Head to the catalog to start adding cards.</p>
            <Link
              href="/account/b2b/catalog"
              className="inline-block rounded bg-ink px-4 py-2 text-sm font-semibold text-page hover:opacity-90"
            >
              Browse catalog →
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wholesale cart"
        description={`${itemCount} item${itemCount === 1 ? "" : "s"} across ${lines.length} sku${lines.length === 1 ? "" : "s"}. Prices recompute at every render.`}
      />

      {(hasOutOfStock || hasMissing) && (
        <Card>
          <div className="text-sm text-accent space-y-1">
            {hasOutOfStock && (
              <p>
                <strong>Stock warning:</strong> one or more lines exceeds available stock. Quantities will be capped at checkout.
              </p>
            )}
            {hasMissing && (
              <p>
                <strong>Catalog drift:</strong> one or more SKUs no longer resolve. Remove them before checkout.
              </p>
            )}
          </div>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border border-border-subtle">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-subtle text-xs uppercase tracking-wider text-ink-muted">
            <tr>
              <th className="px-3 py-3"></th>
              <th className="px-3 py-3">Card</th>
              <th className="px-3 py-3">SKU</th>
              <th className="px-3 py-3 text-right">Stock</th>
              <th className="px-3 py-3 text-right">Unit</th>
              <th className="px-3 py-3 text-center">Qty</th>
              <th className="px-3 py-3 text-right">Line</th>
              <th className="px-3 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {lines.map((line) => {
              const card = line.card;
              const displayName = card?.name_en || card?.name || line.sku;
              const overSold = card && card.stock < line.quantity;
              return (
                <tr key={line.sku} className="bg-surface">
                  <td className="px-3 py-3 w-12">
                    {card?.image_url ? (
                      <Image
                        src={card.image_url}
                        alt={cardAltText(card)}
                        width={36}
                        height={50}
                        className="rounded border border-border-subtle"
                      />
                    ) : (
                      <div className="h-12 w-8 rounded border border-border-subtle bg-page" />
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {card ? (
                      <Link
                        href={`/account/b2b/cards/${encodeURIComponent(line.sku)}`}
                        className="text-ink hover:text-accent"
                      >
                        {displayName}
                      </Link>
                    ) : (
                      <span className="text-danger">Unavailable</span>
                    )}
                    {card && (
                      <div className="text-xs text-ink-faint">
                        {card.card_number} · {card.set_code ?? "—"} · {card.rarity ?? "—"}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-faint">{line.sku}</td>
                  <td className="px-3 py-3 text-right font-mono text-xs">
                    {card ? (
                      <span className={overSold ? "text-danger" : card.stock > 0 ? "text-ok" : "text-ink-faint"}>
                        {card.stock}
                      </span>
                    ) : (
                      <span className="text-ink-faint">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right font-mono">
                    {card && line.unitPrice !== null ? formatPrice(line.unitPrice) : "Unavailable"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    <QtyControl sku={line.sku} initial={line.quantity} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    {card && line.lineTotal !== null ? formatPrice(line.lineTotal) : "Unavailable"}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <RemoveButton sku={line.sku} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="bg-surface-subtle border-t border-border-subtle">
            <tr>
              <td colSpan={6} className="px-3 py-3 text-right text-sm uppercase tracking-wider text-ink-faint">
                Total
              </td>
              <td className="px-3 py-3 text-right text-lg font-bold text-ink">
                {formatPrice(total)}
              </td>
              <td className="px-3 py-3"></td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClearButton />
        <div className="flex gap-3">
          <Link
            href="/account/b2b/catalog"
            className="rounded border border-border-subtle px-4 py-2 text-sm text-ink-muted hover:border-accent hover:text-accent"
          >
            ← Keep shopping
          </Link>
          <Link
            href="/account/b2b/checkout"
            className={
              "rounded bg-ink px-5 py-2 text-sm font-semibold text-page hover:opacity-90 " +
              (lines.length === 0 || hasMissing ? "pointer-events-none opacity-50" : "")
            }
          >
            Proceed to checkout →
          </Link>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        Prices reflect the current wholesale-channel rate at this moment. If a card&rsquo;s price changes between now and checkout, your total at Stripe will match the price at checkout-time, not at add-time.
      </p>
    </div>
  );
}
