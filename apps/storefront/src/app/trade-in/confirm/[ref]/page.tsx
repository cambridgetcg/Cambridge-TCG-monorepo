"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import { gameLabel } from "@/lib/tradein/games";
import { clearSellCart } from "@/lib/tradein/cart";

interface SubmissionItem {
  sku: string;
  game?: string;
  name: string;
  card_number: string;
  quantity: number;
  cash_price: number;
  credit_price: number;
  admin_price: number | null;
  admin_condition: string | null;
  admin_notes: string | null;
  rejected: boolean;
  payout_type: string | null;
}

// Matches the /api/tradein/status payload exactly (camelCase). Anything
// the API returns is typed here; anything it doesn't we treat as null.
interface Submission {
  reference: string;
  status:
    | "submitted"
    | "quoted"
    | "accepted"
    | "declined"
    | "expired"
    | "received"
    | "grading"
    | "approved"
    | "paid"
    | "rejected"
    | "cancelled";
  paymentMethod: string;
  deliveryMethod: string;
  cashTotal: number;
  creditTotal: number;
  expiresAt: string | null;
  createdAt: string;

  // Quote breakdown (post-accept)
  adminMessage: string | null;
  payoutType: string | null;
  cashAmount: number;
  creditAmount: number;
  finalTotal: number;
  mintBonusApplied: boolean;
  mintBonusAmount: number;

  // Fulfilment timestamps (migration 0047)
  receivedAt: string | null;
  gradingAt: string | null;
  approvedAt: string | null;
  paidAt: string | null;

  // Payout completion
  creditIssuedAt: string | null;
  cashPaidAt: string | null;
  stripeTransferId: string | null;
}

interface ConfirmData {
  // API returns fields flat; we wrap for the existing component layout.
  submission: Submission;
  items: SubmissionItem[];
}

function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState("");
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!expiresAt) return;

    function tick() {
      const now = Date.now();
      const end = new Date(expiresAt!).getTime();
      const diff = end - now;
      if (diff <= 0) {
        setExpired(true);
        setRemaining("Expired");
        return;
      }
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      if (hours > 0) {
        setRemaining(`${hours}h ${mins}m ${secs}s`);
      } else {
        setRemaining(`${mins}m ${secs}s`);
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);

  return { remaining, expired };
}

// Customer-facing fulfilment stepper. Mirrors the admin-side timeline
// so both roles see the same mental model. Steps light up from the
// per-status timestamp columns (migration 0047), not string-matching
// on status.
const TIMELINE: Array<{ key: string; label: string; tsField: keyof Submission }> = [
  { key: "received", label: "Received",  tsField: "receivedAt" },
  { key: "grading",  label: "Grading",   tsField: "gradingAt" },
  { key: "approved", label: "Approved",  tsField: "approvedAt" },
  { key: "paid",     label: "Paid",      tsField: "paidAt" },
];

function FulfilmentTimeline({ submission }: { submission: Submission }) {
  return (
    <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6">
      <h3 className="text-sm font-bold text-white mb-3">Progress</h3>
      <div className="flex items-center gap-2 overflow-x-auto">
        {TIMELINE.map((step, i) => {
          const ts = submission[step.tsField] as string | null;
          const done = !!ts;
          const isCurrent = done && !TIMELINE.slice(i + 1).some((s) => submission[s.tsField]);
          return (
            <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex flex-col items-center gap-1 min-w-0 ${done ? "text-white" : "text-neutral-600"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ring-2 ${
                  done
                    ? isCurrent ? "bg-amber-500 text-black ring-amber-500/30" : "bg-emerald-500 text-black ring-emerald-500/20"
                    : "bg-neutral-800 text-neutral-600 ring-neutral-700"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className="text-[11px] whitespace-nowrap">{step.label}</div>
                {ts && (
                  <div className="text-[10px] text-neutral-500 font-mono whitespace-nowrap">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
              {i < TIMELINE.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-neutral-800"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Payout completion summary. Only rendered when the submission has
// actually reached 'paid' — before that the timeline is enough signal.
function PayoutBadges({ submission }: { submission: Submission }) {
  const creditIssued = !!submission.creditIssuedAt;
  const cashPaid = !!submission.cashPaidAt;
  const hasCredit = submission.creditAmount > 0;
  const hasCash = submission.cashAmount > 0;
  if (!hasCredit && !hasCash) return null;
  if (submission.status !== "paid") return null;

  return (
    <div className="flex items-center gap-2 flex-wrap text-xs mb-6">
      {hasCredit && (
        <span className={`px-3 py-1.5 rounded-full border ${
          creditIssued
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-neutral-800 border-neutral-700 text-neutral-500"
        }`}>
          Store credit: {creditIssued
            ? `£${submission.creditAmount.toFixed(2)} in your balance`
            : "processing"}
        </span>
      )}
      {hasCash && (
        <span className={`px-3 py-1.5 rounded-full border ${
          cashPaid
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-neutral-800 border-neutral-700 text-neutral-500"
        }`}>
          Cash: {cashPaid
            ? submission.stripeTransferId
              ? "sent via Stripe"
              : "paid"
            : "processing"}
        </span>
      )}
    </div>
  );
}

export default function ConfirmPage() {
  const params = useParams();
  const ref = params.ref as string;
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeclineModal, setShowDeclineModal] = useState(false);

  useEffect(() => {
    clearSellCart();
  }, []);

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tradein/status?reference=${encodeURIComponent(ref)}`);
      if (!res.ok) {
        setError("Submission not found. Check your reference number.");
        setLoading(false);
        return;
      }
      const json = await res.json();
      // API returns fields flat at the top level; wrap into { submission, items }
      // so the rest of the component doesn't have to care.
      setData({ submission: json as Submission, items: json.items ?? [] });
    } catch {
      setError("Failed to load confirmation details.");
    }
    setLoading(false);
  }, [ref]);

  useEffect(() => {
    // loadData itself calls setState on success/error — that's the
    // whole point of the effect. eslint's set-state-in-effect guard
    // targets synchronous setState storms, not async data fetches.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadData();
  }, [loadData]);

  const handleQuoteAction = async (action: "accept" | "decline") => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/tradein/quote", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference: ref, action }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || `Failed to ${action} quotation.`);
        setActionLoading(false);
        return;
      }
      setShowDeclineModal(false);
      await loadData();
    } catch {
      setError("Something went wrong. Please try again.");
    }
    setActionLoading(false);
  };

  const submission = data?.submission;
  const items = data?.items ?? [];

  const { remaining: countdownText, expired: countdownExpired } = useCountdown(
    submission?.expiresAt ?? null
  );

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-400">Loading...</div>
      </main>
    );
  }

  if (error || !data || !submission) {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Not Found</h1>
          <p className="text-neutral-400 mb-6">{error}</p>
          <Link href="/trade-in" className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition">
            Back to Trade-In
          </Link>
        </div>
      </main>
    );
  }

  const submittedDate = submission.createdAt
    ? new Date(submission.createdAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const expiryDate = submission.expiresAt
    ? new Date(submission.expiresAt).toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  const shippingBlock = (
    <div className="bg-neutral-900 rounded-xl p-4 mb-6">
      {submission.deliveryMethod === "mail" ? (
        <>
          <h3 className="text-sm font-bold text-white mb-3">Shipping Instructions</h3>
          <p className="text-sm text-neutral-400 mb-2">Please send your cards to:</p>
          <div className="bg-neutral-800 rounded-lg p-3 text-sm text-white">
            <p>Cambridge TCG</p>
            <p>PO Box 1637</p>
            <p>CAMBRIDGE</p>
            <p>CB1 0PD</p>
          </div>
          <p className="text-xs text-neutral-500 mt-3">
            Include your reference number <strong className="text-amber-400">{submission.reference}</strong> on the package.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-sm font-bold text-white mb-3">In-Store Drop-Off</h3>
          <p className="text-sm text-neutral-400">
            Bring your cards to our shop and quote your reference:
          </p>
          <p className="text-lg font-bold text-amber-400 mt-2">{submission.reference}</p>
        </>
      )}
    </div>
  );

  // ── SUBMITTED ──────────────────────────────────────────────────────
  if (submission.status === "submitted") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Your Trade-In Has Been Received</h1>
            <p className="text-neutral-400 mt-2">We&apos;re reviewing your submission.</p>
          </div>

          <div className="bg-neutral-900 rounded-xl p-6 text-center mb-6">
            <p className="text-sm text-neutral-400 mb-1">Your Reference</p>
            <p className="text-3xl font-black text-amber-400 tracking-wider">{submission.reference}</p>
            {submittedDate && (
              <p className="text-sm text-neutral-500 mt-2">Submitted on {submittedDate}</p>
            )}
          </div>

          <div className="bg-neutral-900 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-white mb-3">
              Items ({items.reduce((s, i) => s + i.quantity, 0)} cards)
            </h3>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-neutral-300">
                    {item.quantity}x {item.name}{" "}
                    <span className="text-neutral-500">({item.card_number}{item.game ? ` · ${gameLabel(item.game)}` : ""})</span>
                  </span>
                  <span className="text-neutral-400">
                    {formatPrice(
                      (submission.paymentMethod === "cash" ? item.cash_price : item.credit_price) * item.quantity
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 mb-6">
            <p className="text-sm text-blue-300">
              We&apos;ll send you a formal quotation within 1-2 business days. You can return to this page at any time using your reference number.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/trade-in"
              className="flex-1 text-center px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
            >
              Trade More Cards
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── QUOTED ─────────────────────────────────────────────────────────
  if (submission.status === "quoted") {
    const acceptedItems = items.filter((i) => !i.rejected);
    const rejectedItems = items.filter((i) => i.rejected);

    const itemsTotal = submission.mintBonusAmount > 0
      ? submission.finalTotal - submission.mintBonusAmount
      : submission.finalTotal;

    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Your Quotation is Ready</h1>
            <p className="text-neutral-400 mt-2">Reference: <span className="text-amber-400 font-bold">{submission.reference}</span></p>
          </div>

          {/* Per-item breakdown */}
          <div className="bg-neutral-900 rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-white mb-3">Item Breakdown</h3>
            <div className="space-y-3">
              {acceptedItems.map((item, idx) => {
                const originalPrice =
                  submission.paymentMethod === "cash" ? item.cash_price : item.credit_price;
                const finalPrice = item.admin_price ?? originalPrice;
                const priceChanged = item.admin_price != null && item.admin_price !== originalPrice;
                return (
                  <div key={idx} className="border-b border-neutral-800 pb-2 last:border-0 last:pb-0">
                    <div className="flex justify-between text-sm">
                      <span className="text-neutral-300">
                        {item.quantity}x {item.name}{" "}
                        <span className="text-neutral-500">({item.card_number}{item.game ? ` · ${gameLabel(item.game)}` : ""})</span>
                      </span>
                      <span className="text-right">
                        {priceChanged ? (
                          <>
                            <span className="text-neutral-500 line-through mr-2">
                              {formatPrice(originalPrice * item.quantity)}
                            </span>
                            <span className="text-amber-400 font-medium">
                              {formatPrice(finalPrice * item.quantity)}
                            </span>
                          </>
                        ) : (
                          <span className="text-amber-400 font-medium">
                            {formatPrice(finalPrice * item.quantity)}
                          </span>
                        )}
                      </span>
                    </div>
                    {(item.admin_condition || item.admin_notes) && (
                      <div className="mt-1 text-xs">
                        {item.admin_condition && (
                          <span className="text-yellow-400 mr-3">Condition: {item.admin_condition}</span>
                        )}
                        {item.admin_notes && (
                          <span className="text-neutral-500">{item.admin_notes}</span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {rejectedItems.map((item, idx) => (
                <div key={`rej-${idx}`} className="border-b border-neutral-800 pb-2 last:border-0 last:pb-0 opacity-50">
                  <div className="flex justify-between text-sm line-through">
                    <span className="text-neutral-500">
                      {item.quantity}x {item.name}{" "}
                      <span>({item.card_number}{item.game ? ` · ${gameLabel(item.game)}` : ""})</span>
                    </span>
                    <span className="text-neutral-500">Rejected</span>
                  </div>
                  {item.admin_notes && (
                    <p className="text-xs text-red-400/70 mt-1">{item.admin_notes}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Quotation summary */}
          <div className="bg-neutral-900 border border-amber-500/30 rounded-xl p-6 mb-6">
            <h3 className="text-lg font-bold text-white mb-4">Your Quotation</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-400">Items total</span>
                <span className="text-white">{formatPrice(itemsTotal)}</span>
              </div>

              {submission.mintBonusApplied && submission.mintBonusAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-emerald-400">MINT bonus</span>
                  <span className="text-emerald-400">+ {formatPrice(submission.mintBonusAmount)}</span>
                </div>
              )}

              <div className="border-t border-neutral-700 my-2" />

              {submission.cashAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Cash payout</span>
                  <span className="text-white">{formatPrice(submission.cashAmount)}</span>
                </div>
              )}

              {submission.creditAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Credit payout</span>
                  <span className="text-white">{formatPrice(submission.creditAmount)}</span>
                </div>
              )}

              {submission.finalTotal > 0 && (
                <div className="flex justify-between pt-2 border-t border-neutral-700">
                  <span className="text-white font-bold">Total</span>
                  <span className="text-amber-400 font-bold text-lg">{formatPrice(submission.finalTotal)}</span>
                </div>
              )}
            </div>

            {submission.adminMessage && (
              <div className="mt-4 bg-neutral-800 rounded-lg p-3">
                <p className="text-sm text-neutral-300 italic">&ldquo;{submission.adminMessage}&rdquo;</p>
              </div>
            )}

            {submission.expiresAt && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {countdownExpired ? (
                  <span className="text-red-400">This quotation has expired.</span>
                ) : (
                  <span className="text-neutral-400">
                    Valid for <span className="text-white font-medium">{countdownText}</span>
                    {expiryDate && <span className="text-neutral-500"> (expires {expiryDate})</span>}
                  </span>
                )}
              </div>
            )}

            {!countdownExpired && (
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <button
                  onClick={() => handleQuoteAction("accept")}
                  disabled={actionLoading}
                  className="flex-1 px-6 py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {actionLoading ? "Processing..." : "Accept Quotation"}
                </button>
                <button
                  onClick={() => setShowDeclineModal(true)}
                  disabled={actionLoading}
                  className="flex-1 px-6 py-3 bg-neutral-800 text-neutral-300 font-medium rounded-lg hover:bg-neutral-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Decline
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/trade-in"
              className="flex-1 text-center px-6 py-3 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition"
            >
              Back to Trade-In
            </Link>
          </div>
        </div>

        {showDeclineModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
            <div className="bg-neutral-900 rounded-xl p-6 max-w-md w-full">
              <h3 className="text-lg font-bold text-white mb-2">Decline Quotation?</h3>
              <p className="text-sm text-neutral-400 mb-6">
                Are you sure you want to decline this quotation? This action cannot be undone. You can submit a new trade-in at any time.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => handleQuoteAction("decline")}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-bold rounded-lg hover:bg-red-500 transition disabled:opacity-50"
                >
                  {actionLoading ? "Processing..." : "Yes, Decline"}
                </button>
                <button
                  onClick={() => setShowDeclineModal(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2 bg-neutral-800 text-neutral-300 font-medium rounded-lg hover:bg-neutral-700 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    );
  }

  // ── POST-ACCEPT FULFILMENT CHAIN ───────────────────────────────────
  // Unified view for accepted / received / grading / approved / paid.
  // A single layout with timeline + stage-specific copy keeps the
  // customer anchored to the same page through the whole journey.
  if (["accepted", "received", "grading", "approved", "paid"].includes(submission.status)) {
    // Static class strings so Tailwind's JIT can see them — dynamic
    // `bg-${tone}-500/20` would be stripped from the build.
    const STAGE_TONE: Record<string, { bg: string; text: string }> = {
      emerald: { bg: "bg-emerald-500/20", text: "text-emerald-400" },
      blue:    { bg: "bg-blue-500/20",    text: "text-blue-400" },
    };
    const stageCopy: Record<string, { heading: string; body: string; tone: "emerald" | "blue" }> = {
      accepted: {
        heading: "Quotation Accepted",
        body: submission.deliveryMethod === "mail"
          ? "Post your cards to us and we'll take it from here. You'll see each step update below."
          : "Bring your cards to the shop when you're ready. Progress updates will appear below.",
        tone: "emerald",
      },
      received: {
        heading: "Cards Received",
        body: "Your cards arrived at Cambridge TCG. We'll start grading next.",
        tone: "blue",
      },
      grading: {
        heading: "Grading in Progress",
        body: "Our team is going through each card. Payment follows approval.",
        tone: "blue",
      },
      approved: {
        heading: "Grading Complete",
        body: "Everything checks out. Payment is queued and will dispatch shortly.",
        tone: "emerald",
      },
      paid: {
        heading: "Paid",
        body: submission.cashAmount > 0
          ? "Your payout has been sent. Store credit (if any) is in your balance; cash payouts land within 1–3 business days."
          : "Your store credit is in your balance now.",
        tone: "emerald",
      },
    };
    const copy = stageCopy[submission.status];
    const tone = STAGE_TONE[copy.tone];

    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center mb-10">
            <div className={`w-16 h-16 ${tone.bg} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <svg xmlns="http://www.w3.org/2000/svg" className={`w-8 h-8 ${tone.text}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{copy.heading}</h1>
            <p className="text-neutral-400 mt-2">Reference: <span className="text-amber-400 font-bold">{submission.reference}</span></p>
            <p className="text-sm text-neutral-500 mt-3 max-w-md mx-auto">{copy.body}</p>
          </div>

          <FulfilmentTimeline submission={submission} />

          <PayoutBadges submission={submission} />

          <div className="bg-neutral-900 rounded-xl p-5 mb-6">
            <h3 className="text-sm font-bold text-white mb-3">Payout Summary</h3>
            <div className="space-y-1 text-sm">
              {submission.cashAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Cash</span>
                  <span className="text-white">{formatPrice(submission.cashAmount)}</span>
                </div>
              )}
              {submission.creditAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-400">Store credit</span>
                  <span className="text-white">{formatPrice(submission.creditAmount)}</span>
                </div>
              )}
              {submission.mintBonusApplied && submission.mintBonusAmount > 0 && (
                <div className="flex justify-between">
                  <span className="text-emerald-400">MINT bonus</span>
                  <span className="text-emerald-400">+ {formatPrice(submission.mintBonusAmount)}</span>
                </div>
              )}
              {submission.finalTotal > 0 && (
                <div className="flex justify-between pt-2 mt-2 border-t border-neutral-800">
                  <span className="text-white font-bold">Total</span>
                  <span className="text-amber-400 font-bold text-lg">{formatPrice(submission.finalTotal)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Shipping reminder — only before the cards are marked received */}
          {submission.status === "accepted" && shippingBlock}

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/trade-in"
              className="flex-1 text-center px-6 py-3 bg-neutral-800 text-white font-medium rounded-lg hover:bg-neutral-700 transition"
            >
              Back to Trade-In
            </Link>
            {submission.status === "paid" && submission.creditIssuedAt && submission.creditAmount > 0 && (
              <Link
                href="/catalog"
                className="flex-1 text-center px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
              >
                Spend Your Credit
              </Link>
            )}
          </div>
        </div>
      </main>
    );
  }

  // ── DECLINED ───────────────────────────────────────────────────────
  if (submission.status === "declined") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-neutral-800 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Quotation Declined</h1>
          <p className="text-neutral-400 mb-2">
            You declined the quotation for <span className="text-amber-400 font-bold">{submission.reference}</span>.
          </p>
          <p className="text-neutral-500 mb-8">You can submit a new trade-in anytime.</p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Start New Trade-In
          </Link>
        </div>
      </main>
    );
  }

  // ── EXPIRED ────────────────────────────────────────────────────────
  if (submission.status === "expired") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Quotation Expired</h1>
          <p className="text-neutral-400 mb-2">
            The quotation for <span className="text-amber-400 font-bold">{submission.reference}</span> has expired.
          </p>
          <p className="text-neutral-500 mb-8">Prices may have changed since your original submission. Please submit a new trade-in.</p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Submit New Trade-In
          </Link>
        </div>
      </main>
    );
  }

  // ── REJECTED ───────────────────────────────────────────────────────
  // Cards arrived but grading didn't pass (wrong cards, condition lied
  // about, etc.). Surfaced so the customer isn't left wondering.
  if (submission.status === "rejected") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">Trade-in Not Accepted</h1>
          <p className="text-neutral-400 mb-2">
            We weren&apos;t able to accept trade-in <span className="text-amber-400 font-bold">{submission.reference}</span> after grading.
          </p>
          <p className="text-neutral-500 mb-8">Reach out via the contact page if you&apos;d like more detail.</p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Submit New Trade-In
          </Link>
        </div>
      </main>
    );
  }

  // ── CANCELLED ──────────────────────────────────────────────────────
  if (submission.status === "cancelled") {
    return (
      <main className="min-h-screen bg-neutral-950">
        <div className="max-w-2xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Trade-in Cancelled</h1>
          <p className="text-neutral-400 mb-8">
            Trade-in <span className="text-amber-400 font-bold">{submission.reference}</span> has been cancelled.
          </p>
          <Link
            href="/trade-in"
            className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Back to Trade-In
          </Link>
        </div>
      </main>
    );
  }

  // ── FALLBACK (unknown status) ──────────────────────────────────────
  return (
    <main className="min-h-screen bg-neutral-950">
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">Trade-In Status</h1>
        <p className="text-neutral-400 mb-2">Reference: <span className="text-amber-400 font-bold">{submission.reference}</span></p>
        <p className="text-neutral-500 mb-8">Status: {submission.status}</p>
        <Link
          href="/trade-in"
          className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition"
        >
          Back to Trade-In
        </Link>
      </div>
    </main>
  );
}
