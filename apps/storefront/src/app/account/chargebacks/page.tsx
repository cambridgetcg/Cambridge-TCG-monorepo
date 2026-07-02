"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface Chargeback {
  stripe_dispute_id: string;
  amount_gbp: string;
  currency: string;
  stripe_status: string;
  stripe_reason: string | null;
  evidence_due_at: string | null;
  order_id: number | null;
  created_at: string;
}

// Plain-English copy per status — what does this mean for the user?
const STATUS_COPY: Record<string, { label: string; tone: string; advice: string }> = {
  needs_response: {
    label: "Awaiting our response",
    tone: "bg-accent/10 text-accent-strong border-accent/30",
    advice: "Your bank's chargeback is being reviewed. If you raised this in error, contact support — we can withdraw the dispute.",
  },
  warning_needs_response: {
    label: "Bank inquiry — needs our response",
    tone: "bg-accent/10 text-accent-strong border-accent/30",
    advice: "Your bank flagged this charge. Reach out if it's a misunderstanding.",
  },
  under_review: {
    label: "Under review",
    tone: "bg-sky-500/10 text-info border-sky-500/30",
    advice: "Stripe is reviewing the dispute. No action needed from you right now.",
  },
  warning_under_review: {
    label: "Bank inquiry — under review",
    tone: "bg-sky-500/10 text-info border-sky-500/30",
    advice: "Bank inquiry being processed.",
  },
  won: {
    label: "Resolved in our favour",
    tone: "bg-emerald-500/10 text-secondary border-emerald-500/30",
    advice: "The dispute closed without a refund.",
  },
  lost: {
    label: "Refunded to bank",
    tone: "bg-danger/10 text-red-400 border-danger/30",
    advice: "The bank refunded the disputed amount. Your account standing may have been affected.",
  },
  warning_closed: {
    label: "Inquiry closed",
    tone: "bg-surface-elevated text-ink-muted border-border-strong",
    advice: "The bank inquiry is closed.",
  },
  charge_refunded: {
    label: "Charge refunded",
    tone: "bg-sky-500/10 text-info border-sky-500/30",
    advice: "The charge was refunded — dispute moot.",
  },
  admin_resolved: {
    label: "Resolved by support",
    tone: "bg-surface-elevated text-ink-muted border-border-strong",
    advice: "Our support team marked this dispute resolved.",
  },
};

export default function AccountChargebacksPage() {
  const [chargebacks, setChargebacks] = useState<Chargeback[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/account/chargebacks")
      .then((r) => r.json())
      .then((d) => setChargebacks(d?.chargebacks ?? []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-ink mb-2">Chargebacks</h1>
      <p className="text-sm text-ink-muted mb-6">
        Bank disputes filed against charges on your account. If anything here is unexpected, contact{" "}
        <a href="mailto:support@cambridgetcg.com" className="text-accent-strong underline">support@cambridgetcg.com</a>{" "}
        — most disputes resolve fastest by reaching out directly.
      </p>

      {loading ? (
        <p className="text-ink-faint">Loading…</p>
      ) : chargebacks.length === 0 ? (
        <div className="bg-emerald-500/5 border border-emerald-500/30 rounded-xl p-6 text-center">
          <p className="text-secondary font-bold mb-1">No chargebacks on file ✓</p>
          <p className="text-xs text-ink-faint">
            See your{" "}
            <Link href="/account/standing" className="text-accent-strong underline">account standing</Link>{" "}
            for full reputation status.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {chargebacks.map((c) => {
            const copy = STATUS_COPY[c.stripe_status] ?? {
              label: c.stripe_status.replace(/_/g, " "),
              tone: "bg-surface-elevated text-ink-muted border-border-strong",
              advice: "",
            };
            return (
              <div key={c.stripe_dispute_id} className={`rounded-xl border p-4 ${copy.tone}`}>
                <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
                  <h3 className="font-bold">{copy.label}</h3>
                  <span className="text-xs opacity-70">
                    {new Date(c.created_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </span>
                </div>
                <p className="text-2xl font-bold mb-2">£{parseFloat(c.amount_gbp).toFixed(2)}</p>
                {c.stripe_reason && (
                  <p className="text-xs opacity-80 mb-2">Reason: {c.stripe_reason.replace(/_/g, " ")}</p>
                )}
                <p className="text-sm opacity-90">{copy.advice}</p>
                {c.order_id && (
                  <p className="text-[11px] opacity-60 mt-2">Related to order #{c.order_id}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
