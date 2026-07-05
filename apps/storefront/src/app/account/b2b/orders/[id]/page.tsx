/**
 * /account/b2b/orders/[id] — single B2B order detail.
 *
 * Phase 2.2c. Scoped by user_id; loadOrderById returns null for
 * orders owned by other users, which triggers notFound() — a buyer
 * can't probe other buyers' orders by guessing IDs.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth/realms";
import { loadOrderById } from "@/lib/b2b/orders";
import { fetchCard } from "@/lib/wholesale/client";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";

interface PageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `Order #${id} — Wholesale — Cambridge TCG`,
    description: `B2B order details for order ${id}.`,
    other: audienceMetadata("consumer", ["wholesale", "b2b", "order", id]),
  };
}

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid · awaiting allocation",
  allocated: "Allocated · ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function B2BOrderDetailPage({ params }: PageProps) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const user = await getSessionUser();
  const order = await loadOrderById(user!.id, id);
  if (!order) notFound();

  // Resolve current display names for the items. The order row's
  // items array stores sku + qty + price_pence — substrate-honest
  // about what was paid; we re-resolve the display name lazily so
  // the page stays informative if a card's title was updated.
  const enriched = await Promise.all(
    order.items.map(async (it) => {
      const card = await fetchCard(it.sku, "wholesale");
      return {
        ...it,
        displayName: card?.name_en || card?.name || it.sku,
        cardNumber: card?.card_number ?? null,
        imageUrl: card?.image_url ?? null,
      };
    }),
  );

  const label = STATUS_LABEL[order.status] ?? order.status;
  const shipping = order.shipping_address as
    | { address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string; state?: string }; name?: string }
    | null;

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title={`Order #${order.id}`}
        description={`Placed ${fmtDateTime(order.created_at)} · ${label}`}
      />

      <Link
        href="/account/b2b/orders"
        className="inline-block text-sm text-ink-muted hover:text-accent"
      >
        ← All orders
      </Link>

      <Card>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Items</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-ink-faint">
              <tr>
                <th className="pb-2">Card</th>
                <th className="pb-2 text-right">Qty</th>
                <th className="pb-2 text-right">Unit</th>
                <th className="pb-2 text-right">Line</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {enriched.map((it) => (
                <tr key={it.sku}>
                  <td className="py-2">
                    <div className="font-medium">{it.displayName}</div>
                    <div className="text-xs font-mono text-ink-faint">
                      {it.cardNumber ? `${it.cardNumber} · ` : ""}{it.sku}
                    </div>
                  </td>
                  <td className="py-2 text-right">{it.qty}</td>
                  <td className="py-2 text-right font-mono">
                    {formatPrice(it.price_pence / 100)}
                  </td>
                  <td className="py-2 text-right font-mono font-semibold">
                    {formatPrice((it.price_pence * it.qty) / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border-subtle">
              <tr>
                <td colSpan={3} className="pt-3 text-right text-sm uppercase tracking-wider text-ink-faint">
                  Total
                </td>
                <td className="pt-3 text-right text-xl font-bold">
                  {formatPrice(order.total_pence / 100)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      {shipping?.address && (
        <Card>
          <div className="space-y-1 text-sm">
            <h2 className="text-lg font-semibold">Shipping address</h2>
            {shipping.name && <p className="font-medium">{shipping.name}</p>}
            {shipping.address.line1 && <p>{shipping.address.line1}</p>}
            {shipping.address.line2 && <p>{shipping.address.line2}</p>}
            <p>
              {[shipping.address.city, shipping.address.state, shipping.address.postal_code].filter(Boolean).join(", ")}
            </p>
            {shipping.address.country && <p>{shipping.address.country}</p>}
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-1 text-sm text-ink-muted">
          <h2 className="text-lg font-semibold text-ink">Payment</h2>
          <p>
            Status:{" "}
            <span className="font-medium text-ink">{label}</span>
          </p>
          <p>
            Stripe session:{" "}
            <span className="font-mono text-xs">{order.stripe_session_id}</span>
          </p>
          {order.stripe_payment_intent_id && (
            <p>
              Payment intent:{" "}
              <span className="font-mono text-xs">{order.stripe_payment_intent_id}</span>
            </p>
          )}
        </div>
      </Card>
    </div>
  );
}
