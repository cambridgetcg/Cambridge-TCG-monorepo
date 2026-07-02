/**
 * /admin/commerce/b2b-orders/[id] — order detail + operator transitions.
 *
 * Auth gated by /admin/layout.tsx. Reads sfQuery (b2b_orders lives in
 * storefront RDS). Renders items, totals, buyer info, shipping
 * address, Stripe identifiers, and the legal-next-state buttons.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { sfQuery } from "@/lib/admin/db";
import { PageHeader, Provenance } from "@/lib/admin/ui";
import { fmtGBP, fmtDateTime } from "@/lib/format";
import { TransitionButtons } from "../_components";

export const metadata: Metadata = { title: "B2B order detail" };

interface OrderRow {
  id: number;
  user_id: string;
  customer_email: string | null;
  buyer_email: string | null;
  stripe_session_id: string;
  stripe_payment_intent_id: string | null;
  total_pence: number;
  currency: string;
  status: "paid" | "allocated" | "shipped" | "delivered" | "cancelled" | "refunded";
  channel: string;
  items: { sku: string; qty: number; price_pence: number }[];
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export default async function AdminB2BOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = parseInt(idStr, 10);
  if (!Number.isFinite(id) || id <= 0) notFound();

  const result = await sfQuery<OrderRow>(
    `SELECT
       b.id, b.user_id, b.customer_email, u.email AS buyer_email,
       b.stripe_session_id, b.stripe_payment_intent_id,
       b.total_pence, b.currency, b.status, b.channel,
       b.items, b.shipping_address,
       b.created_at::text AS created_at,
       b.updated_at::text AS updated_at
     FROM b2b_orders b
     LEFT JOIN users u ON u.id = b.user_id
     WHERE b.id = $1`,
    [id],
  );

  const order = result.rows[0];
  if (!order) notFound();

  const shipping = order.shipping_address as
    | { address?: { line1?: string; line2?: string; city?: string; postal_code?: string; country?: string; state?: string }; name?: string }
    | null;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`B2B order #${order.id}`}
        description={`${order.status} · placed ${fmtDateTime(order.created_at)}`}
        action={<Provenance kind="live" source="b2b_orders" />}
      />

      <Link href="/admin/commerce/b2b-orders" className="inline-block text-sm text-ink-muted hover:text-accent-strong">
        ← All B2B orders
      </Link>

      <section className="rounded-lg border border-border-subtle p-4">
        <h2 className="text-lg font-semibold mb-3">Actions</h2>
        <TransitionButtons id={order.id} status={order.status} />
      </section>

      <section className="rounded-lg border border-border-subtle p-4">
        <h2 className="text-lg font-semibold mb-3">Buyer</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          <dt className="text-ink-faint">User ID</dt>
          <dd className="font-mono text-xs">{order.user_id}</dd>
          <dt className="text-ink-faint">Email (account)</dt>
          <dd>{order.buyer_email ?? "—"}</dd>
          <dt className="text-ink-faint">Email (Stripe)</dt>
          <dd>{order.customer_email ?? "—"}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-border-subtle p-4">
        <h2 className="text-lg font-semibold mb-3">Items</h2>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-ink-faint">
            <tr>
              <th className="pb-2">SKU</th>
              <th className="pb-2 text-right">Qty</th>
              <th className="pb-2 text-right">Unit</th>
              <th className="pb-2 text-right">Line</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-subtle">
            {order.items.map((it) => (
              <tr key={it.sku}>
                <td className="py-2 font-mono text-xs">{it.sku}</td>
                <td className="py-2 text-right">{it.qty}</td>
                <td className="py-2 text-right font-mono">{fmtGBP(it.price_pence / 100)}</td>
                <td className="py-2 text-right font-mono font-semibold">
                  {fmtGBP((it.price_pence * it.qty) / 100)}
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
                {fmtGBP(order.total_pence / 100)}
              </td>
            </tr>
          </tfoot>
        </table>
      </section>

      {shipping?.address && (
        <section className="rounded-lg border border-border-subtle p-4">
          <h2 className="text-lg font-semibold mb-3">Shipping address</h2>
          <div className="space-y-1 text-sm">
            {shipping.name && <p className="font-medium">{shipping.name}</p>}
            {shipping.address.line1 && <p>{shipping.address.line1}</p>}
            {shipping.address.line2 && <p>{shipping.address.line2}</p>}
            <p>
              {[shipping.address.city, shipping.address.state, shipping.address.postal_code]
                .filter(Boolean)
                .join(", ")}
            </p>
            {shipping.address.country && <p>{shipping.address.country}</p>}
          </div>
        </section>
      )}

      <section className="rounded-lg border border-border-subtle p-4">
        <h2 className="text-lg font-semibold mb-3">Payment</h2>
        <dl className="grid grid-cols-[140px_1fr] gap-y-1 text-sm">
          <dt className="text-ink-faint">Status</dt>
          <dd className="font-medium">{order.status}</dd>
          <dt className="text-ink-faint">Channel</dt>
          <dd>{order.channel}</dd>
          <dt className="text-ink-faint">Stripe session</dt>
          <dd className="font-mono text-xs break-all">{order.stripe_session_id}</dd>
          <dt className="text-ink-faint">Payment intent</dt>
          <dd className="font-mono text-xs break-all">{order.stripe_payment_intent_id ?? "—"}</dd>
          <dt className="text-ink-faint">Updated</dt>
          <dd className="text-xs">{fmtDateTime(order.updated_at)}</dd>
        </dl>
      </section>
    </div>
  );
}
