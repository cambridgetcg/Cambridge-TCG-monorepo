"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatDate } from "@/lib/format";
import { Badge, Palettes, Money } from "@/lib/ui";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

import { Audience } from "@/lib/ui";
interface OrderItem {
  type?: string;
  sku: string;
  name: string;
  qty?: number;
  quantity?: number;
  price_gbp?: number;
  spot_price_gbp?: string;
  vault_item_id?: string;
  card_number?: string | null;
  rarity?: string | null;
  image_url?: string | null;
}

interface Order {
  id: number;
  stripe_session_id: string | null;
  customer_name: string;
  status: string;
  total_gbp: string;
  shipping_name: string | null;
  shipping_address: string | null;
  items: OrderItem[];
  created_at: string;
  // Migration 0055 fulfilment fields
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  notes: string | null;
}

// Carrier-specific tracking URLs come from the shared @/lib/shipping/carriers
// module so email templates and the customer order page never drift on
// supported carriers / URL formats.

// Timeline steps — what a customer sees happen to their order. Each
// step is filled when the order's state or timestamp confirms it.
type Filter = "all" | "open" | "delivered";

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) { router.push("/login"); return; }
        return fetch("/api/account/orders").then((r) => r.json());
      })
      .then((data) => {
        if (data?.orders) setOrders(data.orders);
        setLoading(false);
      });
  }, [router]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter === "delivered" && o.status !== "completed") return false;
      if (filter === "open" && (o.status === "completed" || o.status === "refunded" || o.status === "cancelled")) return false;
      if (!term) return true;
      if (String(o.id).includes(term)) return true;
      if (o.tracking_number?.toLowerCase().includes(term)) return true;
      return (o.items || []).some((i) =>
        i.name?.toLowerCase().includes(term) || i.sku?.toLowerCase().includes(term)
      );
    });
  }, [orders, filter, search]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
      <Audience kind="consumer" />
        <p className="text-ink-faint">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-ink mb-6">My Orders</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-ink-faint mb-4">No orders yet.</p>
          <Link
            href="/catalog"
            className="px-6 py-3 bg-accent text-black font-bold rounded-lg hover:bg-accent-strong transition inline-block"
          >
            Browse Cards
          </Link>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap mb-4">
            {([["all", "All"], ["open", "In flight"], ["delivered", "Delivered"]] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`text-xs px-3 py-1.5 rounded-full transition ${
                  filter === k
                    ? "bg-accent text-black font-bold"
                    : "bg-surface text-ink-muted hover:text-ink border border-border-subtle"
                }`}
              >
                {label}
              </button>
            ))}
            <input
              type="search"
              placeholder="Search card, SKU, tracking, order #"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 min-w-[200px] px-3 py-1.5 bg-surface border border-border-subtle rounded-lg text-sm text-ink placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-accent/50"
            />
          </div>

          {filtered.length === 0 && (
            <p className="text-sm text-ink-faint text-center py-8">
              {search ? "No matches." : "No orders in this filter."}
            </p>
          )}

          <div className="space-y-3">
            {filtered.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                expanded={expanded === order.id}
                onToggle={() => setExpanded(expanded === order.id ? null : order.id)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OrderCard({
  order,
  expanded,
  onToggle,
}: {
  order: Order;
  expanded: boolean;
  onToggle: () => void;
}) {
  const trackUrl = buildTrackingUrl(order.carrier, order.tracking_number);
  const items = order.items || [];

  return (
    <div className="bg-surface rounded-xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-elevated/50 transition"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <Badge status={order.status} palette={Palettes.OrderStatusPalette} labels={Palettes.OrderStatusLabels} />
            <span className="text-xs text-ink-faint font-mono">#{order.id}</span>
            <span className="text-xs text-ink-faint">
              {formatDate(order.created_at)}
            </span>
            {order.tracking_number && (
              <span className="text-xs text-secondary font-mono truncate">✈ {order.tracking_number}</span>
            )}
          </div>
          <p className="text-sm text-ink-muted mt-1">
            {items.length} item{items.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-ink"><Money value={parseFloat(order.total_gbp)} /></p>
        </div>
        <span className="text-neutral-600 text-sm">{expanded ? "▲" : "▼"}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border-subtle">
          <OrderTimeline order={order} />

          {order.tracking_number && (
            <div className="mb-4 bg-page/60 border border-border-subtle rounded-lg p-3">
              <span className="text-xs text-ink-faint uppercase tracking-wide">Tracking</span>
              <div className="flex items-baseline gap-2 mt-1 flex-wrap">
                {trackUrl ? (
                  <a
                    href={trackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-strong hover:text-accent-strong font-mono truncate"
                  >
                    {order.tracking_number} ↗
                  </a>
                ) : (
                  <span className="text-sm text-ink font-mono truncate">{order.tracking_number}</span>
                )}
                {order.carrier && (
                  <span className="text-xs text-ink-faint">via {order.carrier}</span>
                )}
              </div>
            </div>
          )}

          {order.shipping_name && (
            <div className="mt-3 mb-3">
              <span className="text-xs text-ink-faint">Shipped to</span>
              <p className="text-sm text-ink">{order.shipping_name}</p>
              {order.shipping_address && (
                <p className="text-xs text-ink-muted mt-1 whitespace-pre-line">{order.shipping_address}</p>
              )}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[320px]">
              <thead>
                <tr className="text-ink-faint text-xs uppercase tracking-wide">
                  <th className="text-left py-2">Item</th>
                  <th className="text-center py-2 w-12">Qty</th>
                  <th className="text-right py-2 w-20">Price</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  // Orders come from two shapes: Stripe checkout (qty +
                  // price_gbp) and vault redemption (quantity + spot_price_gbp).
                  // Normalise so both render cleanly.
                  const qty = item.qty ?? item.quantity ?? 1;
                  const unitPrice = item.price_gbp ?? parseFloat(item.spot_price_gbp ?? "0");
                  return (
                    <tr key={idx} className="border-t border-border-subtle">
                      <td className="py-2 text-ink">
                        {item.name}
                        {item.type === "vault_redemption" && (
                          <span className="ml-2 text-[10px] text-accent-strong uppercase tracking-wider">vault</span>
                        )}
                      </td>
                      <td className="py-2 text-center text-ink-muted">{qty}</td>
                      <td className="py-2 text-right text-ink-muted whitespace-nowrap">
                        {unitPrice > 0 ? <Money value={unitPrice * qty} /> : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// Horizontal stepper: placed → processing → shipped → delivered. Each
// step "done" when its timestamp/status passes. Current step glows amber.
function OrderTimeline({ order }: { order: Order }) {
  const isCompleted = order.status === "completed" || !!order.delivered_at;
  const isShipped = !!order.shipped_at || order.status === "shipped" || order.status === "partially_shipped" || isCompleted;
  const isProcessing = order.status === "processing" || order.status === "redemption_pending" || isShipped;

  const steps: Array<{ key: string; label: string; ts: string | null; done: boolean }> = [
    { key: "placed",     label: "Placed",     ts: order.created_at, done: true },
    { key: "processing", label: "Processing", ts: null, done: isProcessing },
    { key: "shipped",    label: "Shipped",    ts: order.shipped_at, done: isShipped },
    { key: "delivered",  label: "Delivered",  ts: order.delivered_at, done: isCompleted },
  ];

  return (
    <div className="mt-4 mb-4 bg-page/40 border border-border-subtle rounded-xl p-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {steps.map((step, i) => {
          const next = steps[i + 1];
          const isCurrent = step.done && (!next || !next.done);
          return (
            <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex flex-col items-center gap-1 min-w-0 ${step.done ? "text-ink" : "text-neutral-600"}`}>
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ${
                    step.done
                      ? isCurrent ? "bg-accent text-black ring-accent/30" : "bg-emerald-500 text-black ring-emerald-500/20"
                      : "bg-surface-elevated text-neutral-600 ring-neutral-700"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </div>
                <div className="text-[10px] whitespace-nowrap">{step.label}</div>
                {step.ts && step.done && (
                  <div className="text-[9px] text-ink-faint font-mono whitespace-nowrap">
                    {new Date(step.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 ${step.done ? "bg-emerald-500/40" : "bg-surface-elevated"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
