"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Audience, WhyLink } from "@/lib/ui";
interface Chargeback {
  stripe_dispute_id: string;
  stripe_payment_intent: string;
  user_id: string | null;
  order_id: number | null;
  amount_gbp: string;
  currency: string;
  stripe_status: string;
  stripe_reason: string | null;
  evidence_due_at: string | null;
  fraud_emitted: boolean;
  created_at: string;
  user_email: string | null;
  user_name: string | null;
  trust_score: number | null;
  is_suspended: boolean | null;
  order_email: string | null;
}

const STATUS_TONE: Record<string, string> = {
  needs_response:         "bg-red-500/15 text-red-400 border-red-500/40",
  warning_needs_response: "bg-red-500/15 text-red-400 border-red-500/40",
  under_review:           "bg-amber-500/15 text-amber-400 border-amber-500/40",
  warning_under_review:   "bg-amber-500/15 text-amber-400 border-amber-500/40",
  won:                    "bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  lost:                   "bg-neutral-700 text-neutral-400 border-neutral-600",
  warning_closed:         "bg-neutral-700 text-neutral-400 border-neutral-600",
  charge_refunded:        "bg-sky-500/15 text-sky-400 border-sky-500/40",
  admin_resolved:         "bg-neutral-700 text-neutral-400 border-neutral-600",
};

export default function AdminChargebacksPage() {
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [tab, setTab] = useState<"open" | "all">("open");
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/chargebacks?tab=${tab}`);
    if (r.ok) setChargebacks((await r.json()).chargebacks ?? []);
    setLoading(false);
  }, [tab]);
  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "annotate" | "force_resolve") {
    const reason = window.prompt(`Reason for ${action.replace("_", " ")}?`);
    if (reason == null) return;
    setActing(id);
    try {
      const r = await fetch("/api/admin/chargebacks", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stripeDisputeId: id, action, reason }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        alert(d.error || "Action failed");
        return;
      }
      load();
    } finally { setActing(null); }
  }

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <Audience kind="operator" />
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-bold">Chargebacks</h1>
            <p className="text-sm text-neutral-400">
              Stripe disputes. Critical-severity auto-suspends the user via the fraud pipeline.
              <WhyLink href="/methodology/fraud-flag" label="how severity works" />
            </p>
          </div>
          <div className="flex gap-3 text-xs">
            <Link href="/admin/fraud-signals" className="text-amber-400 hover:text-amber-300 underline">Fraud signals →</Link>
            <Link href="/admin/governance" className="text-amber-400 hover:text-amber-300 underline">Governance log →</Link>
          </div>
        </div>

        <div className="flex gap-2 mb-4">
          {(["open", "all"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`text-xs px-3 py-1.5 rounded-lg transition-colors ${
                tab === t ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-900 text-neutral-400 hover:text-white hover:bg-neutral-800"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-neutral-500">Loading…</p>
        ) : chargebacks.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-neutral-500 text-sm">
            No chargebacks match this filter.
          </div>
        ) : (
          <div className="space-y-3">
            {chargebacks.map((c) => {
              const dueMs = c.evidence_due_at ? new Date(c.evidence_due_at).getTime() - Date.now() : null;
              const dueDays = dueMs != null ? Math.floor(dueMs / 86_400_000) : null;
              const dueWarn = dueDays != null && dueDays <= 3;
              return (
                <div key={c.stripe_dispute_id} className={`bg-neutral-900 rounded-xl p-4 border ${
                  dueWarn ? "border-red-500/40" : "border-neutral-800"
                }`}>
                  <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        STATUS_TONE[c.stripe_status] ?? "bg-neutral-700 text-neutral-300 border-neutral-600"
                      }`}>
                        {c.stripe_status.replace(/_/g, " ")}
                      </span>
                      <span className="text-lg font-bold text-amber-400">
                        £{parseFloat(c.amount_gbp).toFixed(2)}
                      </span>
                      {c.stripe_reason && (
                        <span className="text-xs text-neutral-400 italic">{c.stripe_reason}</span>
                      )}
                      {c.is_suspended && (
                        <span className="text-[10px] text-red-400 font-bold uppercase">user suspended</span>
                      )}
                    </div>
                    <span className="text-xs text-neutral-500">
                      {new Date(c.created_at).toLocaleDateString("en-GB")}
                    </span>
                  </div>

                  <div className="text-xs text-neutral-500 grid sm:grid-cols-2 gap-1">
                    <div>
                      <span className="text-neutral-400">User:</span>{" "}
                      {c.user_name ?? c.user_email ?? c.order_email ?? "(orphan)"}
                      {c.trust_score != null && <span className="ml-2">· trust {c.trust_score}</span>}
                    </div>
                    <div className="font-mono text-[11px] text-neutral-600 truncate">
                      {c.stripe_dispute_id}
                    </div>
                  </div>

                  {c.evidence_due_at && (
                    <p className={`text-xs mt-2 ${dueWarn ? "text-red-400 font-bold" : "text-neutral-500"}`}>
                      Evidence due {new Date(c.evidence_due_at).toLocaleDateString("en-GB")}
                      {dueDays != null && (dueDays >= 0 ? ` (${dueDays}d)` : ` (overdue ${Math.abs(dueDays)}d)`)}
                    </p>
                  )}

                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button onClick={() => act(c.stripe_dispute_id, "annotate")} disabled={acting === c.stripe_dispute_id}
                      className="text-[11px] px-2 py-1 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-neutral-300 rounded disabled:opacity-50">
                      Annotate
                    </button>
                    {!["won", "lost", "warning_closed", "charge_refunded", "admin_resolved"].includes(c.stripe_status) && (
                      <button onClick={() => act(c.stripe_dispute_id, "force_resolve")} disabled={acting === c.stripe_dispute_id}
                        className="text-[11px] px-2 py-1 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-400 rounded disabled:opacity-50">
                        Force resolve
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
