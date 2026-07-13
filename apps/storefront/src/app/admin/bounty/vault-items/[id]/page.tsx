"use client";

import { useCallback, useEffect, useState } from "react";
import { use } from "react";
import Image from "next/image";
import Link from "next/link";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface LifecycleEntry {
  id: number;
  action: string;
  priorStatus: string | null;
  notes: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  orderId: number | null;
}

interface VaultItem {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  sku: string;
  card_name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  spot_price_gbp: string;
  status: string;
  source: string;
  bounty_pull_id: string | null;
  acquired_at: string;
  expires_at: string;
  p2p_hold_until: string;
  redemption_order_id: number | null;
  fulfilled_at: string | null;
  sold_back_credit: string | null;
  sold_back_at: string | null;
  notes: string | null;
  order_status: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  shipping_name: string | null;
  shipping_address: string | null;
}

const ACTION_TONE: Record<string, string> = {
  fulfilled: "text-emerald-400",
  undone: "text-amber-400",
  errored: "text-red-400",
  sold_back: "text-sky-400",
  sold_back_failed: "text-red-400",
  expired: "text-neutral-400",
  expired_credit_failed: "text-red-400",
  gifted: "text-fuchsia-400",
  traded: "text-fuchsia-400",
  compensation_reverted: "text-amber-400",
};

export default function AdminVaultItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<{ item: VaultItem; lifecycle: LifecycleEntry[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/bounty/vault-items/${id}`);
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <AdminShell
      title={data ? `Vault Item: ${data.item.card_name}` : "Vault Item"}
      subtitle="Per-item lifecycle: acquisition → terminal state, including every audited transition."
      authProbe={`/api/admin/bounty/vault-items/${id}`}
      actions={
        <div className="flex gap-2">
          <Link
            href="/admin/bounty/redemptions"
            className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition"
          >
            ← Redemptions
          </Link>
          <button
            onClick={refresh}
            disabled={loading}
            className="px-4 py-2 bg-neutral-800 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      }
    >
      <Audience kind="operator" />
      {!data ? (
        <p className="text-neutral-500">{loading ? "Loading..." : "Item not found."}</p>
      ) : (
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left: card snapshot */}
          <section>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <div className="relative aspect-[5/7] rounded-lg overflow-hidden bg-neutral-800 mb-3">
                {data.item.image_url ? (
                  <Image src={data.item.image_url} alt={data.item.card_name} fill sizes="240px" className="object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-neutral-600 text-xs">No image</div>
                )}
              </div>
              <p className="font-bold">{data.item.card_name}</p>
              <p className="text-xs text-neutral-500 mt-0.5">{data.item.card_number} · {data.item.rarity}</p>
              <p className="text-xs text-neutral-500 mt-0.5 font-mono">{data.item.sku}</p>
              <p className="text-sm mt-2">£{parseFloat(data.item.spot_price_gbp).toFixed(2)} <span className="text-xs text-neutral-500">spot</span></p>
              <div className="mt-3 flex gap-2 flex-wrap">
                <Badge label={`status: ${data.item.status}`} />
                <Badge label={`source: ${data.item.source}`} />
              </div>
              {data.item.bounty_pull_id && (
                <Link
                  href={`/verify/pull/${data.item.bounty_pull_id}`}
                  target="_blank"
                  className="block mt-3 text-center text-xs bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 rounded px-3 py-2 transition-colors"
                >
                  ✓ View draw proof ↗
                </Link>
              )}
            </div>
          </section>

          {/* Middle: owner + order context */}
          <section className="space-y-4">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Owner</h3>
              <p className="text-white">{data.item.user_name || "—"}</p>
              <p className="text-xs text-neutral-500">{data.item.user_email}</p>
              <p className="text-[11px] text-neutral-600 font-mono mt-1 break-all">{data.item.user_id}</p>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Timeline</h3>
              <Row label="Acquired" value={fmt(data.item.acquired_at)} />
              <Row label="Hold until" value={fmt(data.item.p2p_hold_until)} />
              <Row label="Expires" value={fmt(data.item.expires_at)} />
              <Row label="Fulfilled" value={fmt(data.item.fulfilled_at)} />
              <Row label="Sold back" value={fmt(data.item.sold_back_at)} />
            </div>

            {data.item.redemption_order_id && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">
                  Redemption Order #{data.item.redemption_order_id}
                </h3>
                <Row label="Status" value={data.item.order_status} />
                <Row label="Carrier" value={data.item.carrier} />
                <Row label="Tracking" value={data.item.tracking_number} />
                <Row label="Shipped" value={fmt(data.item.shipped_at)} />
                {data.item.shipping_name && (
                  <div className="mt-2 text-xs text-neutral-400">
                    <p className="font-semibold text-neutral-300">{data.item.shipping_name}</p>
                    <p className="whitespace-pre-line">{data.item.shipping_address}</p>
                  </div>
                )}
              </div>
            )}

            {data.item.sold_back_credit && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
                <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Sell-back / Expiry</h3>
                <Row label="Credit" value={`£${parseFloat(data.item.sold_back_credit).toFixed(2)}`} />
              </div>
            )}
          </section>

          {/* Right: lifecycle log */}
          <section>
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4">
              <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">Lifecycle Log</h3>
              {data.lifecycle.length === 0 ? (
                <p className="text-xs text-neutral-500 italic">No transitions logged yet.</p>
              ) : (
                <ol className="space-y-3">
                  {data.lifecycle.map((e) => (
                    <li key={e.id} className="border-l-2 border-neutral-800 pl-3">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className={`text-xs font-bold uppercase ${ACTION_TONE[e.action] ?? "text-neutral-300"}`}>
                          {e.action.replace(/_/g, " ")}
                        </span>
                        {e.priorStatus && (
                          <span className="text-[10px] text-neutral-600">from {e.priorStatus}</span>
                        )}
                        <span className="text-[10px] text-neutral-500 ml-auto">{fmt(e.createdAt)}</span>
                      </div>
                      {e.notes && (
                        <p className="text-xs text-neutral-400 mt-1">{e.notes}</p>
                      )}
                      {e.metadata && Object.keys(e.metadata).length > 0 && (
                        <pre className="text-[10px] text-neutral-600 mt-1 font-mono whitespace-pre-wrap break-all">
                          {JSON.stringify(e.metadata, null, 2)}
                        </pre>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            {data.item.notes && (
              <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mt-4">
                <h3 className="text-sm uppercase tracking-wider text-neutral-500 mb-2">Free-form Notes</h3>
                <pre className="text-xs text-neutral-300 whitespace-pre-wrap font-mono">{data.item.notes}</pre>
              </div>
            )}
          </section>
        </div>
      )}
    </AdminShell>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="text-[10px] bg-neutral-800 border border-neutral-700 rounded px-2 py-0.5 uppercase tracking-wider">
      {label}
    </span>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-sm py-1">
      <span className="text-neutral-500">{label}</span>
      <span className="text-neutral-200 text-right">{value}</span>
    </div>
  );
}

function fmt(v: string | null | undefined): string | null {
  if (!v) return null;
  return new Date(v).toLocaleString();
}
