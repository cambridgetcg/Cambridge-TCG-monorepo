"use client";

// Subscription self-service page. Linked to from /account/membership's
// "Manage Subscription" button — which used to 404. Surfaces:
//
//   - Current tier + plan + next renewal date
//   - Cancel-at-period-end banner with resume option
//   - Cancel button (DIY) with confirmation
//   - Open-Stripe-portal CTA (when Customer Portal is configured)
//   - Payment method on file
//   - Recent invoice history with links to hosted invoice PDFs

import { useEffect, useState } from "react";
import Link from "next/link";

import { Audience } from "@/lib/ui";
interface BillingState {
  subscription: {
    status: string | null;
    tierName: string | null;
    plan: string | null;            // 'monthly' | 'annual' | null
    expiresAt: string | null;
    cancelAtPeriodEnd: boolean;
    paymentBrand: string | null;
    paymentLast4: string | null;
    hasCustomer: boolean;
  };
  invoices: Array<{
    id: string;
    created: number;
    amount_paid: number;
    status: string;
    hosted_invoice_url: string | null;
    period_end: number;
  }>;
  invoicesError: string | null;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

function fmtMoney(amountInPence: number): string {
  return "£" + (amountInPence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function BillingPage() {
  const [data, setData] = useState<BillingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-action loading/error state
  const [cancelling, setCancelling] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/membership/billing");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || `Failed to load (HTTP ${res.status})`);
        return;
      }
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function cancel() {
    setActionError(null);
    setCancelling(true);
    try {
      const res = await fetch("/api/membership/cancel", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Cancel failed.");
        return;
      }
      setShowCancelConfirm(false);
      await load();
    } finally {
      setCancelling(false);
    }
  }

  async function resume() {
    setActionError(null);
    setResuming(true);
    try {
      const res = await fetch("/api/membership/resume", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Resume failed.");
        return;
      }
      await load();
    } finally {
      setResuming(false);
    }
  }

  async function openPortal() {
    setActionError(null);
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/membership/portal", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setActionError(data?.error || "Could not open Stripe portal.");
        setOpeningPortal(false);
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setActionError("Network error.");
      setOpeningPortal(false);
    }
  }

  if (loading) {
    return <p className="text-ink-faint text-sm">Loading…</p>;
  }
  if (error) {
    return (
      <div className="bg-danger/10 border border-danger/30 rounded-xl p-4 text-sm text-red-300">
      <Audience kind="consumer" />
        {error}
      </div>
    );
  }
  if (!data) return null;

  const sub = data.subscription;
  const isActive = sub.status === "active";
  const isCancelling = sub.cancelAtPeriodEnd;

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold text-ink">Billing</h1>
        <Link href="/account/membership" className="text-sm text-ink-muted hover:text-ink transition">
          ← Membership
        </Link>
      </div>

      {/* No subscription on file */}
      {!sub.status && (
        <div className="bg-surface rounded-xl p-6">
          <h2 className="text-ink font-bold mb-1">Not subscribed</h2>
          <p className="text-sm text-ink-muted mb-4">
            You haven&apos;t subscribed to Platinum. Upgrade from your membership page.
          </p>
          <Link
            href="/account/membership"
            className="inline-block px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition"
          >
            View Platinum
          </Link>
        </div>
      )}

      {/* Subscription overview */}
      {sub.status && (
        <div className="bg-surface rounded-xl p-6 space-y-4">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <h2 className="text-ink font-bold text-lg">{sub.tierName ?? "Subscription"}</h2>
              <p className="text-xs text-ink-faint mt-0.5">
                Status: <span className={
                  isActive ? "text-secondary" :
                  sub.status === "past_due" ? "text-accent-strong" :
                  sub.status === "cancelled" || sub.status === "canceled" ? "text-red-400" :
                  "text-ink-muted"
                }>{sub.status}</span>
                {sub.plan && <span className="ml-2 text-ink-faint">· {sub.plan}</span>}
              </p>
            </div>
          </div>

          {/* Cancel-at-period-end banner */}
          {isCancelling && (
            <div className="bg-accent/10 border border-accent/30 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-accent-strong text-sm font-medium">
                  Subscription scheduled to cancel
                </p>
                <p className="text-xs text-ink-muted mt-0.5">
                  Access continues until {fmtDate(sub.expiresAt)}, then drops to your spend-based tier.
                </p>
              </div>
              <button
                onClick={resume}
                disabled={resuming}
                className="shrink-0 px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition disabled:opacity-50"
              >
                {resuming ? "…" : "Resume subscription"}
              </button>
            </div>
          )}

          {/* Active normal state */}
          {isActive && !isCancelling && sub.expiresAt && (
            <div className="text-sm text-ink-muted">
              Next renewal: <span className="text-ink">{fmtDate(sub.expiresAt)}</span>
            </div>
          )}

          {/* Payment method */}
          {sub.paymentLast4 && (
            <div className="bg-page/40 border border-border-subtle rounded-lg p-3 flex items-center justify-between">
              <div className="text-sm text-ink-muted">
                <span className="text-ink-faint">Payment</span>
                <span className="ml-2 capitalize">{sub.paymentBrand ?? "Card"}</span>
                <span className="ml-1 font-mono">···· {sub.paymentLast4}</span>
              </div>
              {sub.hasCustomer && (
                <button
                  onClick={openPortal}
                  disabled={openingPortal}
                  className="text-xs text-accent-strong hover:text-accent-strong transition disabled:opacity-50"
                >
                  {openingPortal ? "Opening…" : "Update card →"}
                </button>
              )}
            </div>
          )}

          {/* Action row */}
          <div className="flex items-center gap-3 flex-wrap pt-2 border-t border-border-subtle">
            {sub.hasCustomer && (
              <button
                onClick={openPortal}
                disabled={openingPortal}
                className="text-sm bg-surface-elevated hover:bg-neutral-700 text-ink rounded-lg px-4 py-2 transition disabled:opacity-50"
              >
                {openingPortal ? "Opening Stripe…" : "Open Stripe portal"}
              </button>
            )}
            {isActive && !isCancelling && (
              showCancelConfirm ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-ink-muted">
                    Cancel at end of billing period? You&apos;ll keep Platinum until {fmtDate(sub.expiresAt)}.
                  </span>
                  <button
                    onClick={cancel}
                    disabled={cancelling}
                    className="text-sm bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800 rounded-lg px-3 py-1.5 disabled:opacity-50"
                  >
                    {cancelling ? "…" : "Confirm cancel"}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(false)}
                    disabled={cancelling}
                    className="text-xs text-ink-faint hover:text-ink px-2"
                  >
                    Keep
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(true)}
                  className="text-sm text-red-400 hover:text-red-300 underline"
                >
                  Cancel subscription
                </button>
              )
            )}
          </div>

          {actionError && (
            <p className="text-xs text-red-400">{actionError}</p>
          )}
        </div>
      )}

      {/* Invoice history */}
      <div className="bg-surface rounded-xl p-6">
        <h2 className="text-ink font-bold text-sm uppercase tracking-wide mb-4">Billing history</h2>
        {data.invoicesError ? (
          <p className="text-xs text-ink-faint">
            Couldn&apos;t load history right now ({data.invoicesError}).
          </p>
        ) : data.invoices.length === 0 ? (
          <p className="text-sm text-ink-faint">No invoices yet.</p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {new Date(inv.created * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                  <p className="text-[11px] text-ink-faint mt-0.5">
                    {inv.status}
                    {inv.period_end && (
                      <> · period to {new Date(inv.period_end * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</>
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-mono text-ink">{fmtMoney(inv.amount_paid)}</span>
                  {inv.hosted_invoice_url && (
                    <a
                      href={inv.hosted_invoice_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-accent-strong hover:text-accent-strong"
                    >
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
