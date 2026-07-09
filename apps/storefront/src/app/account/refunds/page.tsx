"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
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
  succeeded: "bg-ok/10 text-ok border-ok/30",
  pending:   "bg-accent-wash text-accent border-accent/30",
  failed:    "bg-danger/10 text-danger border-danger/30",
  canceled:  "bg-surface-subtle text-ink-muted border-border-subtle",
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
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">Refunds</h1>
      <p className="text-sm text-ink-muted mb-6">
        Refunds processed against payments on your account. For
        chargebacks (bank disputes), see{" "}
        <Link href="/account/chargebacks" className="text-accent underline">
          Chargebacks
        </Link>
        .
      </p>

      {loading ? (
        <p className="text-ink-faint">Loading…</p>
      ) : refunds.length === 0 ? (
        <div className="bg-surface border border-border-subtle rounded-lg p-6 text-center text-sm text-ink-faint">
          No refunds on your account.
        </div>
      ) : (
        <div className="space-y-3">
          {refunds.map((r) => (
            <div key={r.stripe_refund_id} className={`rounded-lg border p-4 ${
              STATUS_TONE[r.stripe_status] ?? "bg-surface border-border-subtle"
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
