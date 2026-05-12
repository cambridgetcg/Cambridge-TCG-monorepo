"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { WhyLink } from "@/lib/ui";

import { Audience } from "@/lib/ui";
interface Standing {
  trust_score: number;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_at: string | null;
}

interface Flag {
  id: string;
  signal_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  auto_action: string;
  created_at: string;
}

interface Response {
  standing: Standing;
  flags: Flag[];
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-500/10 text-red-400 border-red-500/30",
  high:     "bg-amber-500/10 text-amber-400 border-amber-500/30",
  medium:   "bg-sky-500/10 text-sky-400 border-sky-500/30",
  low:      "bg-neutral-800 text-neutral-400 border-neutral-700",
};

// Plain-English guidance per signal_type — what triggered it, what to
// do. Customers see THIS, not the cron's internal description.
const FLAG_GUIDANCE: Record<string, { headline: string; advice: string }> = {
  rapid_listing: {
    headline: "Listing burst detected",
    advice: "We saw a lot of orders placed in a short window. Pace your listings — we'll clear this once activity normalises.",
  },
  self_trading: {
    headline: "Possible self-trade pattern",
    advice: "A recent counterparty shares a shipping address with you. If this is a household member, contact support and we'll clear it.",
  },
  refund_abuse: {
    headline: "Multiple buyer-favour refunds",
    advice: "You've had several disputes resolved in your favour recently. We'll clear this naturally as your dispute rate normalises, or contact support.",
  },
  velocity_spike: {
    headline: "Sudden volume spike",
    advice: "Your trading volume jumped suddenly compared to your baseline. The flag clears as your activity stabilises.",
  },
  new_account_high_value: {
    headline: "High-value order on a new account",
    advice: "New accounts placing large orders trigger this automatically. Trust score grows with completed trades — flag clears at 7+ days old.",
  },
  chargeback: {
    headline: "Chargeback received",
    advice: "A bank chargeback was filed against a paid trade. Contact support to provide context and resolve.",
  },
};

export default function AccountStandingPage() {
  const [data, setData] = useState<Response | null>(null);

  useEffect(() => {
    fetch("/api/account/standing").then((r) => r.json()).then(setData);
  }, []);

  if (!data) return <div className="p-8 text-neutral-500">Loading…</div>;

  const { standing, flags } = data;
  const goodStanding = !standing.is_suspended && flags.length === 0;

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-bold text-white mb-2">
        Account Standing
        <WhyLink href="/methodology/fraud-flag" tooltip="How does the platform flag accounts?" />
      </h1>
      <p className="text-sm text-neutral-400 mb-6">
        Your active flags, suspension status, and how to clear them. See your{" "}
        <Link href="/account/trust" className="text-amber-400 underline">trust score</Link>{" "}
        for the full breakdown.
      </p>

      {/* Headline status */}
      <div className={`rounded-xl p-5 mb-6 border ${
        standing.is_suspended ? "border-red-500/40 bg-red-500/5"
          : flags.length > 0 ? "border-amber-500/40 bg-amber-500/5"
          : "border-emerald-500/40 bg-emerald-500/5"
      }`}>
        <div className="flex items-center gap-3">
          <span className={`text-3xl ${
            standing.is_suspended ? "text-red-400"
              : flags.length > 0 ? "text-amber-400"
              : "text-emerald-400"
          }`}>
            {standing.is_suspended ? "✗" : flags.length > 0 ? "!" : "✓"}
          </span>
          <div>
            <p className="font-bold">
              {standing.is_suspended
                ? "Account suspended"
                : flags.length > 0
                  ? `${flags.length} active flag${flags.length === 1 ? "" : "s"}`
                  : "Good standing — no active flags"}
            </p>
            {standing.is_suspended && standing.suspended_reason && (
              <p className="text-xs text-neutral-400 mt-0.5">{standing.suspended_reason}</p>
            )}
            {standing.is_suspended && standing.suspended_at && (
              <p className="text-xs text-neutral-500 mt-0.5">
                Suspended {new Date(standing.suspended_at).toLocaleDateString("en-GB", {
                  day: "numeric", month: "long", year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Active flags */}
      {flags.length > 0 && (
        <section>
          <h2 className="text-sm uppercase tracking-wider text-neutral-500 mb-3">
            Active flags
          </h2>
          <div className="space-y-3">
            {flags.map((f) => {
              const guide = FLAG_GUIDANCE[f.signal_type] ?? {
                headline: f.signal_type.replace(/_/g, " "),
                advice: f.description,
              };
              return (
                <div key={f.id} className={`rounded-xl border p-4 ${SEVERITY_TONE[f.severity] ?? "border-neutral-800 bg-neutral-900"}`}>
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <h3 className="font-bold text-base">{guide.headline}</h3>
                    <span className="text-[10px] uppercase tracking-wider opacity-70">
                      {f.severity}
                    </span>
                  </div>
                  <p className="text-sm mt-1 opacity-90">{guide.advice}</p>
                  <p className="text-[11px] opacity-60 mt-2">
                    Raised {new Date(f.created_at).toLocaleDateString("en-GB")}
                    {f.auto_action !== "none" && (
                      <span className="ml-2">· auto-action: {f.auto_action.replace("_", " ")}</span>
                    )}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-6 p-4 bg-neutral-900 border border-neutral-800 rounded-xl text-sm text-neutral-400">
            <p>
              <strong className="text-neutral-200">Need help?</strong>{" "}
              Most flags clear automatically as your activity normalises. For
              a manual review, reach out at{" "}
              <a href="mailto:support@cambridgetcg.com" className="text-amber-400 underline">
                support@cambridgetcg.com
              </a>{" "}
              with your account email — include any context that explains the flagged behaviour.
            </p>
          </div>
        </section>
      )}

      {goodStanding && (
        <div className="text-center text-sm text-neutral-500 mt-8">
          Your trust score is{" "}
          <Link href="/account/trust" className="text-emerald-400 underline">
            {standing.trust_score}
          </Link>
          . Keep trading well — every completed trade and positive review lifts it.
        </div>
      )}
    </div>
  );
}
