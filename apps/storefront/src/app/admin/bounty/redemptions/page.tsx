"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface Redemption {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  sku: string;
  card_name: string;
  card_number: string | null;
  set_code: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price_gbp: string;
  status: "reserved" | "redeemed";
  acquired_at: string;
  redemption_order_id: number;
  fulfilled_at: string | null;
  shipping_name: string;
  shipping_address: string;
  customer_email: string;
  order_status: string;
  order_created_at: string;
}

export default function AdminBountyRedemptions() {
  const [redemptions, setRedemptions] = useState<Redemption[]>([]);
  const [loading, setLoading] = useState(false);
  const [fulfilling, setFulfilling] = useState<string | null>(null);
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  const [carrierInputs, setCarrierInputs] = useState<Record<string, string>>({});

  const fetchList = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/bounty/redemptions");
      if (res.ok) {
        const d = await res.json();
        setRedemptions(d.redemptions ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, [fetchList]);

  async function handleFulfill(id: string) {
    setFulfilling(id);
    try {
      const res = await fetch(`/api/admin/bounty/redemptions/${id}/fulfill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tracking: trackingInputs[id] || "",
          carrier: carrierInputs[id] || "",
        }),
      });
      if (res.ok) await fetchList();
    } finally {
      setFulfilling(null);
    }
  }

  async function handleUndo(id: string) {
    if (!confirm("Undo fulfilment? The item will return to the pending queue.")) return;
    setFulfilling(id);
    try {
      const res = await fetch(`/api/admin/bounty/redemptions/${id}/undo`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Undo failed.");
        return;
      }
      await fetchList();
    } finally {
      setFulfilling(null);
    }
  }

  async function handleBulkFulfill(orderId: number, key: string) {
    setFulfilling(key);
    try {
      const res = await fetch("/api/admin/bounty/redemptions/bulk-fulfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: orderId,
          tracking: trackingInputs[key] || "",
          carrier: carrierInputs[key] || "",
        }),
      });
      if (res.ok) await fetchList();
    } finally {
      setFulfilling(null);
    }
  }

  const pending = redemptions.filter((r) => r.status === "reserved");
  const recent = redemptions.filter((r) => r.status === "redeemed");

  // Group pending items by redemption order so multi-card shipments
  // render one row with one tracking input instead of N. Single-item
  // orders fall through to the same per-order renderer for consistency.
  const pendingByOrder = new Map<number, Redemption[]>();
  for (const r of pending) {
    const arr = pendingByOrder.get(r.redemption_order_id) ?? [];
    arr.push(r);
    pendingByOrder.set(r.redemption_order_id, arr);
  }
  const pendingOrders = Array.from(pendingByOrder.entries())
    .sort((a, b) => new Date(a[1][0].order_created_at).getTime() - new Date(b[1][0].order_created_at).getTime());

  return (
    <AdminShell
      title="Bounty Redemptions"
      subtitle="Pick, pack, and ship vault-item orders. Tracking + carrier surface on the customer's order page once you fulfill."
      authProbe="/api/admin/bounty/redemptions"
      actions={
        <button
          onClick={fetchList}
          disabled={loading}
          className="px-4 py-2 bg-surface-elevated text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Stat label="Pending" value={pending.length} tone="amber" />
          <Stat label="Fulfilled (recent)" value={recent.length} />
          <Stat label="Total in queue" value={redemptions.length} />
        </div>

        <section className="mb-8">
          <h2 className="text-lg font-bold mb-3">
            Pending <span className="text-accent-strong">({pending.length})</span>
          </h2>
          {pending.length === 0 ? (
            <div className="bg-surface border border-border-subtle rounded-xl p-6 text-center text-ink-faint text-sm">
              Nothing to ship right now.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingOrders.map(([orderId, items]) => {
                if (items.length === 1) {
                  const r = items[0];
                  return (
                    <RedemptionRow
                      key={r.id}
                      r={r}
                      tracking={trackingInputs[r.id] ?? ""}
                      carrier={carrierInputs[r.id] ?? ""}
                      onTracking={(v) => setTrackingInputs((p) => ({ ...p, [r.id]: v }))}
                      onCarrier={(v) => setCarrierInputs((p) => ({ ...p, [r.id]: v }))}
                      onFulfill={() => handleFulfill(r.id)}
                      fulfilling={fulfilling === r.id}
                    />
                  );
                }
                const key = `order-${orderId}`;
                return (
                  <BulkRedemptionCard
                    key={key}
                    orderId={orderId}
                    items={items}
                    tracking={trackingInputs[key] ?? ""}
                    carrier={carrierInputs[key] ?? ""}
                    onTracking={(v) => setTrackingInputs((p) => ({ ...p, [key]: v }))}
                    onCarrier={(v) => setCarrierInputs((p) => ({ ...p, [key]: v }))}
                    onBulkFulfill={() => handleBulkFulfill(orderId, key)}
                    fulfilling={fulfilling === key}
                  />
                );
              })}
            </div>
          )}
        </section>

        {recent.length > 0 && (
          <section>
            <h2 className="text-lg font-bold mb-3">Recently fulfilled</h2>
            <div className="space-y-2">
              {recent.map((r) => {
                const fulfilledMs = r.fulfilled_at ? new Date(r.fulfilled_at).getTime() : 0;
                const ageMs = fulfilledMs ? Date.now() - fulfilledMs : Infinity;
                const undoable = ageMs < 30 * 60 * 1000;
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-3 bg-surface border border-border-subtle/60 rounded-lg px-4 py-2.5 text-sm"
                  >
                    <span className="text-secondary">✓</span>
                    <span className="font-mono text-xs text-ink-faint">#{r.redemption_order_id}</span>
                    <span className="flex-1 truncate">{r.card_name}</span>
                    <span className="text-ink-faint text-xs">{r.shipping_name}</span>
                    <span className="text-neutral-600 text-xs">
                      {r.fulfilled_at ? new Date(r.fulfilled_at).toLocaleDateString() : "—"}
                    </span>
                    {undoable && (
                      <button
                        onClick={() => handleUndo(r.id)}
                        disabled={fulfilling === r.id}
                        className="text-xs text-accent-strong hover:text-accent-strong underline disabled:opacity-50"
                        title="Undo within 30 min of fulfilment"
                      >
                        {fulfilling === r.id ? "..." : "Undo"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}
    </AdminShell>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "amber" }) {
  return (
    <div className="bg-surface rounded-xl p-4">
      <p className="text-xs text-ink-faint uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${tone === "amber" ? "text-accent-strong" : "text-ink"}`}>{value}</p>
    </div>
  );
}

function RedemptionRow({
  r, tracking, carrier, onTracking, onCarrier, onFulfill, fulfilling,
}: {
  r: Redemption;
  tracking: string;
  carrier: string;
  onTracking: (v: string) => void;
  onCarrier: (v: string) => void;
  onFulfill: () => void;
  fulfilling: boolean;
}) {
  return (
    <div className="bg-surface border border-border-subtle rounded-xl p-4 flex flex-wrap items-center gap-4">
      <div className="relative w-14 h-20 flex-shrink-0 rounded overflow-hidden bg-surface-elevated">
        {r.image_url && (
          <Image src={r.image_url} alt={r.card_name} fill sizes="56px" className="object-cover" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <a href={`/admin/bounty/vault-items/${r.id}`} className="font-semibold hover:text-accent-strong transition-colors">
          {r.card_name}
        </a>
        <p className="text-xs text-ink-faint">
          {r.sku} · {r.rarity} · £{parseFloat(r.spot_price_gbp).toFixed(2)}
        </p>
        <p className="text-xs text-ink-faint mt-1">
          Order #{r.redemption_order_id} · {r.user_email ?? r.customer_email}
        </p>
      </div>
      <div className="flex-1 min-w-[220px] text-xs text-ink-muted">
        <p className="font-semibold text-ink-muted">{r.shipping_name}</p>
        <p className="whitespace-pre-wrap leading-snug">{r.shipping_address}</p>
      </div>
      <div className="flex items-center gap-2">
        <input
          value={carrier}
          onChange={(e) => onCarrier(e.target.value)}
          placeholder="Carrier"
          list="carrier-options"
          className="bg-surface-elevated border border-border-strong rounded px-2 py-1.5 text-xs w-24 focus:outline-none focus:border-accent"
        />
        <datalist id="carrier-options">
          <option value="Royal Mail" />
          <option value="Evri" />
          <option value="DPD" />
          <option value="ParcelForce" />
          <option value="UPS" />
          <option value="FedEx" />
        </datalist>
        <input
          value={tracking}
          onChange={(e) => onTracking(e.target.value)}
          placeholder="Tracking #"
          className="bg-surface-elevated border border-border-strong rounded px-3 py-1.5 text-xs w-36 focus:outline-none focus:border-accent"
        />
        <button
          onClick={onFulfill}
          disabled={fulfilling}
          className="bg-accent hover:bg-accent-strong disabled:opacity-50 text-black text-xs font-bold rounded px-4 py-1.5 transition-colors"
        >
          {fulfilling ? "..." : "Fulfill"}
        </button>
      </div>
    </div>
  );
}

function BulkRedemptionCard({
  orderId, items, tracking, carrier, onTracking, onCarrier, onBulkFulfill, fulfilling,
}: {
  orderId: number;
  items: Redemption[];
  tracking: string;
  carrier: string;
  onTracking: (v: string) => void;
  onCarrier: (v: string) => void;
  onBulkFulfill: () => void;
  fulfilling: boolean;
}) {
  const head = items[0];
  return (
    <div className="bg-surface border border-accent/30 rounded-xl p-4">
      <div className="flex flex-wrap items-start gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <p className="font-semibold flex items-center gap-2">
            <span className="text-xs bg-accent/20 text-accent-strong rounded px-2 py-0.5 font-bold">
              {items.length} CARDS · ONE SHIPMENT
            </span>
            <span className="font-mono text-xs text-ink-faint">#{orderId}</span>
          </p>
          <p className="text-xs text-ink-faint mt-1">
            {head.user_email ?? head.customer_email}
          </p>
        </div>
        <div className="flex-1 min-w-[220px] text-xs text-ink-muted">
          <p className="font-semibold text-ink-muted">{head.shipping_name}</p>
          <p className="whitespace-pre-wrap leading-snug">{head.shipping_address}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-3">
        {items.map((it) => (
          <div key={it.id} className="bg-page/50 rounded p-2">
            <div className="relative aspect-[5/7] mb-1 rounded overflow-hidden bg-surface-elevated">
              {it.image_url && (
                <Image src={it.image_url} alt={it.card_name} fill sizes="80px" className="object-cover" />
              )}
            </div>
            <p className="text-[10px] truncate text-ink-muted">{it.card_name}</p>
            <p className="text-[10px] text-ink-faint">£{parseFloat(it.spot_price_gbp).toFixed(2)}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          value={carrier}
          onChange={(e) => onCarrier(e.target.value)}
          placeholder="Carrier"
          list="carrier-options"
          className="bg-surface-elevated border border-border-strong rounded px-2 py-1.5 text-xs w-28 focus:outline-none focus:border-accent"
        />
        <input
          value={tracking}
          onChange={(e) => onTracking(e.target.value)}
          placeholder="Single tracking number for all"
          className="bg-surface-elevated border border-border-strong rounded px-3 py-1.5 text-xs flex-1 min-w-[200px] focus:outline-none focus:border-accent"
        />
        <button
          onClick={onBulkFulfill}
          disabled={fulfilling}
          className="bg-accent hover:bg-accent-strong disabled:opacity-50 text-black text-xs font-bold rounded px-4 py-1.5 transition-colors"
        >
          {fulfilling ? "Shipping..." : `Ship all ${items.length}`}
        </button>
      </div>
    </div>
  );
}
