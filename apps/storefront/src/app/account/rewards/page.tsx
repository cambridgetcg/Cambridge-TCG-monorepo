"use client";

import { useCallback, useEffect, useState } from "react";
import { buildTrackingUrl, getCarrierTracker } from "@/lib/shipping/carriers";

import { Audience } from "@/lib/ui";
interface Prize {
  kind: "raffle" | "mystery_box" | "pack";
  id: string;
  label: string;
  prize_description: string | null;
  image_url: string | null;
  shipping_address: string | null;
  shipping_collected_at: string | null;
  tracking_number: string | null;
  carrier: string | null;
  shipped_at: string | null;
  fulfilled: boolean;
  won_at: string;
}

export default function CustomerPrizesPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftAddress, setDraftAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/rewards/prizes");
    if (r.ok) setPrizes((await r.json()).prizes || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function submitAddress(prize: Prize) {
    if (!draftAddress.trim()) return;
    setSubmitting(true);
    try {
      const r = await fetch("/api/rewards/prizes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: prize.kind, id: prize.id, address: draftAddress.trim() }),
      });
      if (r.ok) {
        setEditingId(null);
        setDraftAddress("");
        load();
      } else {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "Failed to save");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-ink mb-6">Prizes won</h1>

      {loading ? (
        <p className="text-sm text-ink-faint">Loading...</p>
      ) : prizes.length === 0 ? (
        <div className="bg-surface rounded-xl p-8 text-center">
          <p className="text-ink-muted text-sm">No physical prizes yet.</p>
          <p className="text-xs text-ink-faint mt-2">
            Win raffles, open mystery boxes, or pull rare cards from packs to see them here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {prizes.map((p) => {
            const status = p.shipped_at
              ? { label: "Shipped", color: "text-secondary" }
              : p.shipping_collected_at
                ? { label: "Awaiting dispatch", color: "text-blue-400" }
                : { label: "Awaiting your address", color: "text-accent-strong" };
            return (
              <div key={`${p.kind}:${p.id}`} className="bg-surface rounded-xl p-4">
                <div className="flex items-start gap-3 mb-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt="" className="w-16 h-22 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-16 h-22 bg-surface-elevated rounded-lg shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-faint capitalize">{p.kind.replace("_", " ")}</p>
                    <p className="text-base font-bold text-ink truncate">{p.label}</p>
                    {p.prize_description && (
                      <p className="text-xs text-ink-muted mt-1 truncate">{p.prize_description}</p>
                    )}
                    <p className={`text-xs mt-1 font-medium ${status.color}`}>{status.label}</p>
                  </div>
                </div>

                {!p.shipping_collected_at ? (
                  editingId === `${p.kind}:${p.id}` ? (
                    <div className="space-y-2">
                      <textarea
                        value={draftAddress}
                        onChange={(e) => setDraftAddress(e.target.value)}
                        placeholder="Full shipping address (line 1, city, postcode, country)"
                        rows={3}
                        className="w-full px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm resize-none"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => submitAddress(p)} disabled={submitting}
                          className="px-3 py-1.5 text-xs font-bold bg-accent text-black rounded-md hover:bg-accent-strong transition disabled:opacity-50">
                          {submitting ? "Saving..." : "Save address"}
                        </button>
                        <button onClick={() => { setEditingId(null); setDraftAddress(""); }}
                          className="px-3 py-1.5 text-xs text-ink-muted hover:text-ink">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingId(`${p.kind}:${p.id}`); setDraftAddress(""); }}
                      className="px-3 py-1.5 text-xs font-bold bg-accent text-black rounded-md hover:bg-accent-strong transition"
                    >
                      Add shipping address
                    </button>
                  )
                ) : (
                  <PrizeShippingBlock prize={p} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PrizeShippingBlock({ prize: p }: { prize: Prize }) {
  const trackUrl = buildTrackingUrl(p.carrier, p.tracking_number);
  const carrierLabel = getCarrierTracker(p.carrier)?.label ?? p.carrier;
  return (
    <div className="text-xs text-ink-muted space-y-3">
      <Timeline prize={p} />

      <div className="border-t border-border-subtle pt-3">
        <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">Ship to</p>
        <p className="whitespace-pre-wrap text-ink-muted">{p.shipping_address}</p>
      </div>

      {p.tracking_number && (
        <div className="border-t border-border-subtle pt-3">
          <p className="text-[10px] uppercase tracking-wider text-ink-faint mb-1">
            {carrierLabel ? `${carrierLabel} tracking` : "Tracking"}
          </p>
          {trackUrl ? (
            <a
              href={trackUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-strong hover:text-accent-strong underline font-mono text-sm"
            >
              {p.tracking_number} ↗
            </a>
          ) : (
            <span className="font-mono text-ink-muted text-sm">{p.tracking_number}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Timeline({ prize: p }: { prize: Prize }) {
  const steps = [
    {
      key: "won",
      label: "Won",
      ts: p.won_at,
      done: true,
    },
    {
      key: "address",
      label: "Address confirmed",
      ts: p.shipping_collected_at,
      done: !!p.shipping_collected_at,
    },
    {
      key: "shipped",
      label: "Shipped",
      ts: p.shipped_at,
      done: !!p.shipped_at,
    },
    {
      key: "fulfilled",
      label: "Delivered",
      ts: null,
      done: p.fulfilled,
    },
  ];
  return (
    <div className="flex items-start gap-2 flex-wrap">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
            s.done ? "bg-emerald-500/20 text-secondary border border-emerald-500/40"
              : "bg-surface-elevated text-neutral-600 border border-border-strong"
          }`}>
            {s.done ? "✓" : i + 1}
          </div>
          <div>
            <p className={`text-xs ${s.done ? "text-ink" : "text-ink-faint"}`}>{s.label}</p>
            {s.ts && (
              <p className="text-[10px] text-ink-faint">
                {new Date(s.ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
