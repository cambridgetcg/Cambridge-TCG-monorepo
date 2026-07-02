/**
 * /account/b2b/orders — buyer-facing wholesale order history.
 *
 * Phase 2.2c. Reads from b2b_orders (written by the Stripe webhook
 * on checkout.session.completed). Items are stored as JSONB on the
 * order row so the page renders without a JOIN.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/realms";
import { loadOrdersForUser } from "@/lib/b2b/orders";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Wholesale orders — Cambridge TCG",
  description: "Your B2B order history.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "orders"]),
};

const STATUS_TONE: Record<string, string> = {
  paid: "bg-accent/20 text-accent-strong ring-accent/40",
  allocated: "bg-blue-500/20 text-blue-400 ring-blue-500/40",
  shipped: "bg-emerald-500/20 text-secondary ring-emerald-500/40",
  delivered: "bg-emerald-500/30 text-emerald-300 ring-emerald-500/50",
  cancelled: "bg-neutral-700 text-ink-muted ring-neutral-600",
  refunded: "bg-purple-500/20 text-purple-400 ring-purple-500/40",
};

const STATUS_LABEL: Record<string, string> = {
  paid: "Paid · awaiting allocation",
  allocated: "Allocated · ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function B2BOrdersPage() {
  const user = await getSessionUser();
  const orders = await loadOrdersForUser(user!.id, 50);

  if (orders.length === 0) {
    return (
      <div className="space-y-6 max-w-2xl">
        <PageHeader title="Orders" description="Your wholesale order history." />
        <Card>
          <div className="space-y-3 text-sm text-ink-muted">
            <p>No B2B orders yet. Once you place one through the cart, it&rsquo;ll appear here within seconds of Stripe confirming payment.</p>
            <Link
              href="/account/b2b/catalog"
              className="inline-block rounded bg-accent px-4 py-2 text-sm font-semibold text-neutral-950 hover:bg-accent-strong"
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
        title="Orders"
        description={`${orders.length} order${orders.length === 1 ? "" : "s"} on your wholesale account.`}
      />

      <div className="space-y-3">
        {orders.map((order) => {
          const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
          const tone = STATUS_TONE[order.status] ?? STATUS_TONE.paid;
          const label = STATUS_LABEL[order.status] ?? order.status;
          return (
            <Link
              key={order.id}
              href={`/account/b2b/orders/${order.id}`}
              className="block group"
            >
              <Card>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-semibold group-hover:text-accent-strong">
                        Order #{order.id}
                      </span>
                      <span
                        className={
                          "inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 " +
                          tone
                        }
                      >
                        {label}
                      </span>
                    </div>
                    <div className="text-xs text-ink-faint">
                      {fmtDate(order.created_at)} · {itemCount} item{itemCount === 1 ? "" : "s"} across {order.items.length} sku{order.items.length === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xl font-semibold">
                      {formatPrice(order.total_pence / 100)}
                    </div>
                    <div className="text-xs text-ink-faint">{order.currency.toUpperCase()}</div>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
