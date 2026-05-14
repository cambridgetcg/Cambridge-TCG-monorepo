/**
 * /account/b2b — wholesale shell dashboard.
 *
 * KPI grid at the top (cart, orders by status, last order) over the
 * existing two-card link section. Reads cart count + recent orders;
 * both queries are scoped to the cached session user from the
 * layout's role gate (no extra DB roundtrip for auth).
 *
 * Companion to:
 *   - docs/connections/the-four-auth-realms.md (S30) — realm topology
 *   - docs/connections/the-b2b-mini-app.md (S31) — this mini-app's meaning
 *   - apps/storefront/src/lib/b2b/cart.ts + orders.ts — the read sources
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getSessionUser } from "@/lib/auth/realms";
import { countItems } from "@/lib/b2b/cart";
import { loadOrdersForUser } from "@/lib/b2b/orders";
import { Card, PageHeader, audienceMetadata } from "@/lib/ui";
import { formatPrice } from "@/lib/format";

export const metadata: Metadata = {
  title: "Wholesale — Cambridge TCG",
  description:
    "Your B2B shell. Browse the catalog at wholesale prices, manage orders, and check stock.",
  other: audienceMetadata("consumer", ["wholesale", "b2b", "account"]),
};

const OPEN_STATUSES = new Set(["paid", "allocated", "shipped"]);

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatCard({
  label,
  value,
  sub,
  tone = "neutral",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "neutral" | "amber" | "emerald" | "sky";
  href?: string;
}) {
  const toneCls: Record<string, string> = {
    neutral: "text-neutral-100",
    amber: "text-amber-400",
    emerald: "text-emerald-400",
    sky: "text-sky-400",
  };
  const body = (
    <Card>
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
        <div className={`text-2xl font-semibold ${toneCls[tone]}`}>{value}</div>
        {sub && <div className="text-xs text-neutral-500">{sub}</div>}
      </div>
    </Card>
  );
  return href ? (
    <Link href={href} className="block hover:opacity-80 transition-opacity">
      {body}
    </Link>
  ) : (
    body
  );
}

export default async function WholesaleShellPage() {
  const user = await getSessionUser();
  // Layout's requireWholesalePage() already ran; user is guaranteed.
  const [cartCount, orders] = await Promise.all([
    countItems(user!.id).catch(() => 0),
    loadOrdersForUser(user!.id, 50).catch(() => []),
  ]);

  const openCount = orders.filter((o) => OPEN_STATUSES.has(o.status)).length;
  const totalSpentPence = orders.reduce((s, o) => s + o.total_pence, 0);
  const lastOrder = orders[0] ?? null;
  const recent = orders.slice(0, 3);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wholesale"
        description="Your B2B account. Wholesale prices apply inside this section; public storefront pages keep showing retail."
      />

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="In cart"
          value={cartCount}
          sub={cartCount > 0 ? "ready to checkout" : "empty"}
          tone={cartCount > 0 ? "amber" : "neutral"}
          href={cartCount > 0 ? "/account/b2b/cart" : "/account/b2b/catalog"}
        />
        <StatCard
          label="Open orders"
          value={openCount}
          sub={openCount === 0 ? "none in flight" : "paid / allocated / shipped"}
          tone={openCount > 0 ? "sky" : "neutral"}
          href="/account/b2b/orders"
        />
        <StatCard
          label="All-time orders"
          value={orders.length}
          sub={orders.length === 0 ? "none yet" : `${formatPrice(totalSpentPence / 100)} total`}
          tone="neutral"
          href={orders.length > 0 ? "/account/b2b/orders" : undefined}
        />
        <StatCard
          label="Last order"
          value={lastOrder ? fmtDate(lastOrder.created_at) : "—"}
          sub={lastOrder ? `#${lastOrder.id}` : "place your first"}
          tone="neutral"
          href={lastOrder ? `/account/b2b/orders/${lastOrder.id}` : undefined}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/account/b2b/catalog" className="block group">
          <Card>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold group-hover:text-amber-400">Catalog →</h2>
              <p className="text-sm text-neutral-400">
                Browse the full Cambridge TCG catalog at wholesale prices. Filter by game, set,
                search by name, sort by price.
              </p>
            </div>
          </Card>
        </Link>

        <Link
          href={cartCount > 0 ? "/account/b2b/checkout" : "/account/b2b/catalog"}
          className="block group"
        >
          <Card>
            <div className="space-y-2">
              <h2 className="text-lg font-semibold group-hover:text-amber-400">
                {cartCount > 0 ? "Checkout →" : "Start a cart →"}
              </h2>
              <p className="text-sm text-neutral-400">
                {cartCount > 0
                  ? `${cartCount} item${cartCount === 1 ? "" : "s"} waiting in your cart. Stripe handles payment at wholesale prices.`
                  : "Add cards from the catalog and check out via Stripe."}
              </p>
            </div>
          </Card>
        </Link>
      </div>

      {recent.length > 0 && (
        <Card>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">Recent orders</h2>
              <Link
                href="/account/b2b/orders"
                className="text-sm text-amber-400 hover:underline"
              >
                View all →
              </Link>
            </div>
            <ul className="space-y-2">
              {recent.map((order) => {
                const itemCount = order.items.reduce((s, i) => s + i.qty, 0);
                return (
                  <li key={order.id}>
                    <Link
                      href={`/account/b2b/orders/${order.id}`}
                      className="flex items-baseline justify-between gap-3 rounded border border-neutral-800 px-3 py-2 hover:border-neutral-700 hover:bg-neutral-900"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-neutral-100">
                          Order #{order.id}{" "}
                          <span className="ml-1 text-xs text-neutral-500">· {order.status}</span>
                        </div>
                        <div className="text-xs text-neutral-500">
                          {fmtDate(order.created_at)} · {itemCount} item{itemCount === 1 ? "" : "s"}
                        </div>
                      </div>
                      <div className="font-mono text-sm">{formatPrice(order.total_pence / 100)}</div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </Card>
      )}

      <Card>
        <div className="space-y-2 text-sm text-neutral-400">
          <p className="font-medium text-neutral-200">How pricing works here</p>
          <p>
            Public pages on cambridgetcg.com always show the retail price — even
            when you&rsquo;re logged in. The wholesale channel applies only inside
            this <code className="rounded bg-neutral-800 px-1 py-0.5 text-xs">/account/b2b/*</code>{" "}
            section. This keeps public prices stable for everyone and the B2B
            view crisply separate.
          </p>
        </div>
      </Card>
    </div>
  );
}
