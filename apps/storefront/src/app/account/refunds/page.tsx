"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Refund {
  stripe_refund_id: string;
  amount_gbp: string;
  currency: string;
  stripe_status: string;
  stripe_reason: string | null;
  initiated_by: string;
  order_id: number | null;
  created_at: string;
}

const STATUS_TONE: Record<string, string> = {
  succeeded: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  pending:   "bg-amber-500/10 text-amber-400 border-amber-500/30",
  failed:    "bg-red-500/10 text-red-400 border-red-500/30",
  canceled:  "bg-neutral-800 text-neutral-400 border-neutral-700",
};

const REASON_COPY: Record<string, string> = {
  duplicate:              "Duplicate charge",
  fraudulent:             "Marked fraudulent",
  requested_by_customer:  "At your request",
};

export default function AccountRefundsPage() {
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account/refunds")
      .then((r) => r.json())
      .then((d) => setRefunds(d?.refunds ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Refunds</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Refunds processed against payments on your account. For
        chargebacks (bank disputes), see{" "}
        <Link href="/account/chargebacks" className="text-amber-400 underline">
          Chargebacks
        </Link>
        .
      </p>

      {loading ? (
        <p className="text-neutral-500">Loading…</p>
      ) : refunds.length === 0 ? (
        <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 text-center text-sm text-neutral-500">
          No refunds on your account.
        </div>
      ) : (
        <div className="space-y-3">
          {refunds.map((r) => (
            <div key={r.stripe_refund_id} className={`rounded-xl border p-4 ${
              STATUS_TONE[r.stripe_status] ?? "bg-neutral-900 border-neutral-800"
            }`}>
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                <h3 className="font-bold capitalize">{r.stripe_status}</h3>
                <span className="text-xs opacity-70">
                  {new Date(r.created_at).toLocaleDateString("en-GB", {
                    day: "numeric", month: "long", year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-2xl font-bold mb-2">£{parseFloat(r.amount_gbp).toFixed(2)}</p>
              {r.stripe_reason && (
                <p className="text-xs opacity-80 mb-1">
                  Reason: {REASON_COPY[r.stripe_reason] ?? r.stripe_reason.replace(/_/g, " ")}
                </p>
              )}
              <p className="text-[11px] opacity-60">
                {r.initiated_by === "admin" ? "Issued by support" : "Issued via Stripe"}
                {r.order_id && <span className="ml-2">· Order #{r.order_id}</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
