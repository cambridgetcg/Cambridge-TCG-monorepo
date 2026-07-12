/**
 * /account/b2b/cart — the B2B shopping cart.
 *
 * Existing cart rows remain visible and removable while new item creation,
 * price resolution, and checkout are paused. Structural card and stock data
 * may still be refreshed; no hidden value is used to compute a total.
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
import { B2B_PURCHASE_AVAILABILITY } from "@/lib/b2b/purchase-availability";
import { QtyControl, RemoveButton, ClearButton } from "./_client";

export const metadata: Metadata = {
  title: "Wholesale cart — Cambridge TCG",
  description:
    "Review or remove existing B2B cart rows. New pricing and checkout are paused.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "cart"]),
};

interface CartLine {
  sku: string;
  quantity: number;
  card: PriceItem | null;
}

export default async function B2BCartPage() {
  const user = await getSessionUser();
  // Layout guarantees user != null.
  const rows = await loadCartRows(user!.id);

  // Resolve structural card and stock fields only. The shared adapter does
  // not select or emit legacy price/image fields.
  const lines: CartLine[] = await Promise.all(
    rows.map(async (r): Promise<CartLine> => {
      const card = await fetchCard(r.sku, "wholesale");
      return {
        sku: r.sku,
        quantity: r.quantity,
        card,
      };
    }),
  );

  const itemCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  const hasOutOfStock = lines.some((l) => l.card && l.card.stock < l.quantity);
  const hasMissing = lines.some((l) => !l.card);

  if (lines.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Wholesale cart" description="Your cart is empty." />
        <Card>
          <div className="text-sm text-ink-muted space-y-3">
            <p>
              Nothing is stored in your cart. The catalog remains available for
              structural browsing, but new cart items and checkout are paused.
            </p>
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
        description={`${itemCount} stored item${itemCount === 1 ? "" : "s"} across ${lines.length} sku${lines.length === 1 ? "" : "s"}. ${B2B_PURCHASE_AVAILABILITY.reason}`}
      />

      <Card>
        <p className="text-sm text-ink-muted">
          Existing rows can be adjusted or removed. Price values, totals, new
          cart items, and Stripe checkout are unavailable.
        </p>
      </Card>

      {(hasOutOfStock || hasMissing) && (
        <Card>
          <div className="text-sm text-accent space-y-1">
            {hasOutOfStock && (
              <p>
                <strong>Stock warning:</strong> one or more stored lines exceeds
                the current structural stock count.
              </p>
            )}
            {hasMissing && (
              <p>
                <strong>Catalog drift:</strong> one or more SKUs no longer resolve.
                You can remove those stored rows.
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
              <th className="px-3 py-3 text-right">Legacy price</th>
              <th className="px-3 py-3 text-center">Qty</th>
              <th className="px-3 py-3 text-right">Line total</th>
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
                    <span className="text-ink-faint">Withheld</span>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <QtyControl sku={line.sku} initial={line.quantity} />
                  </td>
                  <td className="px-3 py-3 text-right font-semibold">
                    <span className="text-ink-faint">Unavailable</span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <RemoveButton sku={line.sku} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ClearButton />
        <div>
          <Link
            href="/account/b2b/catalog"
            className="rounded border border-border-subtle px-4 py-2 text-sm text-ink-muted hover:border-accent hover:text-accent"
          >
            ← Structural catalog
          </Link>
        </div>
      </div>

      <p className="text-xs text-ink-faint">
        No price-derived selection, total, reservation, or Stripe session is
        created from this page. Completed order receipts remain available in
        order history.
      </p>
    </div>
  );
}
