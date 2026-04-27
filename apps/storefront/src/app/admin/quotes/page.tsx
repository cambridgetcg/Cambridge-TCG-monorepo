"use client";

import { useState, useEffect, useCallback } from "react";
import { formatPrice } from "@/lib/format";
import ConfirmModal from "@/components/ui/ConfirmModal";
import AdminShell from "@/components/admin/AdminShell";

interface QuoteRequest {
  id: number;
  reference: string;
  status: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  payment_method: string;
  delivery_method: string;
  notes: string | null;
  admin_notes: string | null;
  quoted_total: string | null;
  offer_expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Fulfilment chain (migrations 0046 + 0051)
  credit_amount?: string | null;
  cash_amount?: string | null;
  received_at?: string | null;
  paid_at?: string | null;
  credit_issued_at?: string | null;
  cash_paid_at?: string | null;
  stripe_transfer_id?: string | null;
}

interface QuoteImage {
  id: number;
  item_id: number;
  url: string;
  s3_key: string;
}

interface QuoteItem {
  id: number;
  request_id: number;
  description: string;
  game: string | null;
  set_name: string | null;
  condition: string;
  quantity: number;
  customer_notes: string | null;
  offered_price: string | null;
  admin_notes: string | null;
  rejected: boolean;
  images?: QuoteImage[];
}

interface QuoteSummary {
  request: QuoteRequest;
  itemCount: number;
}

interface QuoteDetail {
  request: QuoteRequest;
  items: QuoteItem[];
}

interface ItemPriceState {
  id: number;
  offered_price: string;
  rejected: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/20 text-amber-400",
  quoted: "bg-blue-500/20 text-blue-400",
  accepted: "bg-emerald-500/20 text-emerald-400",
  received: "bg-blue-500/20 text-blue-400",
  paid: "bg-green-500/20 text-green-400",
  declined: "bg-red-500/20 text-red-400",
  expired: "bg-neutral-500/20 text-neutral-400",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

// Valid admin-driven transitions per status (API enforces these too).
// pending → handled by the price-setting form.
// quoted/accepted/declined/expired — customer or sweep drives them.
const TRANSITIONS: Record<string, string[]> = {
  pending:   [],
  quoted:    ["cancelled"],
  accepted:  ["received", "cancelled"],
  received:  ["paid", "cancelled"],
  paid:      [],
  declined:  [],
  expired:   [],
  cancelled: [],
};

const TIMELINE_STEPS: Array<{ key: string; label: string; tsField: keyof QuoteRequest }> = [
  { key: "received", label: "Received", tsField: "received_at" },
  { key: "paid",     label: "Paid",     tsField: "paid_at" },
];

export default function AdminQuotesPage() {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, QuoteDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [itemPrices, setItemPrices] = useState<Record<string, ItemPriceState[]>>({});
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const fetchQuotes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/quotes");
      if (res.ok) {
        const data = await res.json();
        setQuotes(data.quotes || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (ref: string) => {
    if (detail[ref]) return;
    setDetailLoading(ref);
    try {
      const res = await fetch(`/api/quotes/${ref}`);
      if (!res.ok) return;
      const data: QuoteDetail = await res.json();
      setDetail((prev) => ({ ...prev, [ref]: data }));
      // Initialize price state for pending quotes
      if (data.request.status === "pending") {
        setItemPrices((prev) => ({
          ...prev,
          [ref]: data.items.map((item) => ({
            id: item.id,
            offered_price: item.offered_price || "",
            rejected: item.rejected || false,
          })),
        }));
      }
      setAdminNotes((prev) => ({
        ...prev,
        [ref]: data.request.admin_notes || "",
      }));
    } catch {
      // ignore
    } finally {
      setDetailLoading(null);
    }
  }, [detail]);

  useEffect(() => { fetchQuotes(); }, [fetchQuotes]);

  function handleExpand(ref: string) {
    if (expanded === ref) {
      setExpanded(null);
    } else {
      setExpanded(ref);
      fetchDetail(ref);
    }
  }

  function updateItemPrice(ref: string, itemId: number, field: "offered_price" | "rejected", value: string | boolean) {
    setItemPrices((prev) => ({
      ...prev,
      [ref]: (prev[ref] || []).map((ip) =>
        ip.id === itemId ? { ...ip, [field]: value } : ip
      ),
    }));
  }

  async function handleSendOffer(ref: string) {
    const prices = itemPrices[ref];
    if (!prices) return;

    setSubmitting(ref);
    try {
      const res = await fetch(`/api/quotes/${ref}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "send_offer",
          items: prices.map((ip) => ({
            id: ip.id,
            offered_price: ip.rejected ? null : (parseFloat(ip.offered_price) || null),
            rejected: ip.rejected,
          })),
          adminNotes: adminNotes[ref] || "",
        }),
      });
      if (res.ok) {
        const data = await res.json();
        // Update summary list
        setQuotes((prev) =>
          prev.map((q) =>
            q.request.reference === ref ? { ...q, request: data.request } : q
          )
        );
        // Clear cached detail so it reloads
        setDetail((prev) => {
          const next = { ...prev };
          delete next[ref];
          return next;
        });
        fetchDetail(ref);
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(null);
    }
  }

  function handleCancel(ref: string) {
    setPendingAction(() => async () => {
      setSubmitting(ref);
      try {
        const res = await fetch(`/api/quotes/${ref}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "cancel" }),
        });
        if (res.ok) {
          const data = await res.json();
          setQuotes((prev) =>
            prev.map((q) =>
              q.request.reference === ref ? { ...q, request: data.request } : q
            )
          );
          if (detail[ref]) {
            setDetail((prev) => ({
              ...prev,
              [ref]: { ...prev[ref], request: data.request },
            }));
          }
        }
      } catch {
        // ignore
      } finally {
        setSubmitting(null);
      }
    });
    setConfirmOpen(true);
  }

  // Advance along the fulfilment chain: received/paid/cancelled. On
  // 'paid' the server fires credit + Stripe transfer; it returns the
  // updated row which we blit in so timeline + payout badges refresh
  // without a refetch.
  async function handleStatusChange(ref: string, newStatus: string) {
    setSubmitting(ref);
    try {
      const res = await fetch(`/api/quotes/${ref}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_status", status: newStatus }),
      });
      if (res.ok) {
        const data = await res.json();
        setQuotes((prev) =>
          prev.map((q) =>
            q.request.reference === ref ? { ...q, request: data.request } : q
          )
        );
        if (detail[ref]) {
          setDetail((prev) => ({
            ...prev,
            [ref]: { ...prev[ref], request: data.request },
          }));
        }
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(null);
    }
  }

  // ── Stats ──
  const total = quotes.length;
  const pendingCount = quotes.filter((q) => q.request.status === "pending").length;
  const quotedCount = quotes.filter((q) => q.request.status === "quoted").length;
  const acceptedCount = quotes.filter((q) => q.request.status === "accepted").length;

  return (
    <AdminShell
      title="Custom Quote Requests"
      authProbe="/api/quotes"
      actions={
        <button
          onClick={fetchQuotes}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-white mt-1">{total}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Pending Review</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{pendingCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Quoted</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{quotedCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Accepted</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{acceptedCount}</p>
          </div>
        </div>

        {/* Quotes list */}
        {quotes.length === 0 && !loading && (
          <p className="text-neutral-500 text-center py-12">No quote requests yet.</p>
        )}

        <div className="space-y-3">
          {quotes.map(({ request: q, itemCount }) => {
            const d = detail[q.reference];
            const prices = itemPrices[q.reference];
            const isExpanded = expanded === q.reference;
            const isPending = q.status === "pending";
            const isQuoted = q.status === "quoted";

            return (
              <div key={q.reference} className="bg-neutral-900 rounded-xl overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => handleExpand(q.reference)}
                  className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-800/50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-mono font-bold text-amber-400">{q.reference}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[q.status] || "bg-neutral-700 text-neutral-300"}`}>
                        {q.status}
                      </span>
                      <span className="text-xs text-neutral-500">
                        {itemCount} item{itemCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-300 mt-1">{q.customer_name} — {q.customer_email}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {q.quoted_total && (
                      <p className="text-sm font-bold text-white">
                        {formatPrice(parseFloat(q.quoted_total))}
                      </p>
                    )}
                    <p className="text-xs text-neutral-500">
                      {new Date(q.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-neutral-600 text-sm">{isExpanded ? "\u25B2" : "\u25BC"}</span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-neutral-800">
                    {detailLoading === q.reference && (
                      <p className="text-neutral-500 text-sm py-4">Loading...</p>
                    )}

                    {d && (
                      <>
                        {/* Customer details */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-4 text-sm">
                          <div>
                            <span className="text-neutral-500">Phone</span>
                            <p className="text-white">{d.request.customer_phone || "\u2014"}</p>
                          </div>
                          <div>
                            <span className="text-neutral-500">Payment</span>
                            <p className="text-white">{d.request.payment_method === "cash" ? "Cash" : "Credit"}</p>
                          </div>
                          <div>
                            <span className="text-neutral-500">Delivery</span>
                            <p className="text-white">{d.request.delivery_method === "mail" ? "Mail" : "In-store"}</p>
                          </div>
                          <div>
                            <span className="text-neutral-500">Expires</span>
                            <p className="text-white">
                              {d.request.offer_expires_at
                                ? new Date(d.request.offer_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                                : "\u2014"}
                            </p>
                          </div>
                        </div>

                        {d.request.notes && (
                          <div className="mb-4">
                            <span className="text-xs text-neutral-500">Customer Notes</span>
                            <p className="text-sm text-neutral-300 mt-1">{d.request.notes}</p>
                          </div>
                        )}

                        {/* Items */}
                        <div className="space-y-4 mb-4">
                          {d.items.map((item) => {
                            const priceState = prices?.find((p) => p.id === item.id);

                            return (
                              <div key={item.id} className="border border-neutral-800 rounded-lg p-3">
                                <div className="flex items-start gap-3">
                                  {/* Images */}
                                  {item.images && item.images.length > 0 && (
                                    <div className="flex gap-2 shrink-0">
                                      {item.images.map((img) => (
                                        <a
                                          key={img.id}
                                          href={img.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="block"
                                        >
                                          <img
                                            src={img.url}
                                            alt="Card photo"
                                            className="w-16 h-16 object-cover rounded-lg border border-neutral-700"
                                          />
                                        </a>
                                      ))}
                                    </div>
                                  )}

                                  {/* Item info */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-white">{item.description}</p>
                                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                                      {item.game && (
                                        <span className="text-xs text-neutral-400">{item.game}</span>
                                      )}
                                      {item.set_name && (
                                        <span className="text-xs text-neutral-400">{item.set_name}</span>
                                      )}
                                      <span className="text-xs text-neutral-400">{item.condition}</span>
                                      <span className="text-xs text-neutral-500">Qty: {item.quantity}</span>
                                    </div>
                                    {item.customer_notes && (
                                      <p className="text-xs text-neutral-500 mt-1">{item.customer_notes}</p>
                                    )}
                                  </div>

                                  {/* Price input or read-only price */}
                                  <div className="shrink-0 text-right">
                                    {isPending && priceState ? (
                                      <div className="flex items-center gap-2">
                                        <label className="flex items-center gap-1 text-xs text-neutral-400">
                                          <input
                                            type="checkbox"
                                            checked={priceState.rejected}
                                            onChange={(e) => updateItemPrice(q.reference, item.id, "rejected", e.target.checked)}
                                            className="rounded border-neutral-600"
                                          />
                                          Reject
                                        </label>
                                        <div className="relative">
                                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-neutral-500 text-sm">£</span>
                                          <input
                                            type="number"
                                            step="0.01"
                                            min="0"
                                            placeholder="0.00"
                                            value={priceState.offered_price}
                                            onChange={(e) => updateItemPrice(q.reference, item.id, "offered_price", e.target.value)}
                                            disabled={priceState.rejected}
                                            className="w-24 pl-6 pr-2 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm text-right focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-30"
                                          />
                                        </div>
                                      </div>
                                    ) : (
                                      <div>
                                        {item.rejected ? (
                                          <span className="text-xs text-red-400 font-medium">Rejected</span>
                                        ) : item.offered_price ? (
                                          <span className="text-sm font-bold text-white">
                                            {formatPrice(parseFloat(item.offered_price) * item.quantity)}
                                          </span>
                                        ) : (
                                          <span className="text-xs text-neutral-500">{"\u2014"}</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Quoted total for non-pending */}
                        {isQuoted && d.request.quoted_total && (
                          <div className="mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-blue-400">Offer sent — awaiting customer response</span>
                              <span className="text-lg font-bold text-white">{formatPrice(parseFloat(d.request.quoted_total))}</span>
                            </div>
                          </div>
                        )}

                        {d.request.status === "accepted" && d.request.quoted_total && (
                          <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                            <div className="flex items-center justify-between">
                              <span className="text-sm text-emerald-400">Customer accepted</span>
                              <span className="text-lg font-bold text-white">{formatPrice(parseFloat(d.request.quoted_total))}</span>
                            </div>
                          </div>
                        )}

                        {d.request.status === "declined" && (
                          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <span className="text-sm text-red-400">Customer declined the offer</span>
                          </div>
                        )}

                        {d.request.admin_notes && !isPending && (
                          <div className="mb-4">
                            <span className="text-xs text-neutral-500">Admin Notes</span>
                            <p className="text-sm text-neutral-300 mt-1">{d.request.admin_notes}</p>
                          </div>
                        )}

                        {/* Actions for pending quotes */}
                        {isPending && (
                          <>
                            <div className="mb-4">
                              <label className="text-xs text-neutral-500 block mb-1">Admin Notes</label>
                              <textarea
                                value={adminNotes[q.reference] || ""}
                                onChange={(e) => setAdminNotes((prev) => ({ ...prev, [q.reference]: e.target.value }))}
                                placeholder="Internal notes or message to customer..."
                                rows={2}
                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                              />
                            </div>
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => handleSendOffer(q.reference)}
                                disabled={submitting === q.reference}
                                className="px-4 py-2 bg-amber-500 text-black font-bold text-sm rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                              >
                                {submitting === q.reference ? "Sending..." : "Send Offer"}
                              </button>
                              <button
                                onClick={() => handleCancel(q.reference)}
                                disabled={submitting === q.reference}
                                className="px-4 py-2 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
                              >
                                Cancel Request
                              </button>
                            </div>
                          </>
                        )}

                        {/* Cancel for quoted (not yet responded) */}
                        {isQuoted && (
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleCancel(q.reference)}
                              disabled={submitting === q.reference}
                              className="px-4 py-2 bg-neutral-800 text-neutral-300 text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
                            >
                              Cancel Request
                            </button>
                          </div>
                        )}

                        <QuoteTimeline request={d.request} />
                        <QuotePayoutBadges request={d.request} />

                        {/* Valid lifecycle transitions post-accept */}
                        {(TRANSITIONS[d.request.status] ?? []).length > 0 && (
                          <div className="flex items-center gap-2 flex-wrap mt-4">
                            <span className="text-xs text-neutral-500">Advance to:</span>
                            {(TRANSITIONS[d.request.status] ?? []).map((st) => {
                              const isDanger = st === "cancelled";
                              const isPay = st === "paid";
                              const base = "text-xs px-3 py-1.5 rounded-lg font-medium transition";
                              const tone = isPay
                                ? "bg-emerald-500 hover:bg-emerald-400 text-black"
                                : isDanger
                                  ? "bg-red-900/40 hover:bg-red-900/60 text-red-300 border border-red-800"
                                  : "bg-amber-500 hover:bg-amber-400 text-black";
                              return (
                                <button
                                  key={st}
                                  onClick={() => handleStatusChange(q.reference, st)}
                                  disabled={submitting === q.reference}
                                  className={`${base} ${tone} disabled:opacity-50`}
                                >
                                  {submitting === q.reference ? "…" : `→ ${st}`}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <ConfirmModal
          open={confirmOpen}
          title="Cancel Quote"
          message="Cancel this quote request?"
          confirmLabel="Cancel Request"
          variant="danger"
          onConfirm={() => { pendingAction?.(); setConfirmOpen(false); setPendingAction(null); }}
          onCancel={() => { setConfirmOpen(false); setPendingAction(null); }}
        />
    </AdminShell>
  );
}

// Horizontal stepper for received → paid. A step is "done" when its
// timestamp column is set; the latest done step renders as "current".
// Rendered only after the customer accepts — before that there's no
// meaningful fulfilment progress to show.
function QuoteTimeline({ request }: { request: QuoteRequest }) {
  if (!["accepted", "received", "paid"].includes(request.status)) return null;
  return (
    <div className="mt-4 bg-neutral-900/40 border border-neutral-800 rounded-xl p-3">
      <div className="flex items-center gap-2 overflow-x-auto">
        {TIMELINE_STEPS.map((step, i) => {
          const ts = request[step.tsField] as string | null | undefined;
          const done = !!ts;
          const isCurrent = done && !TIMELINE_STEPS.slice(i + 1).some((s) => request[s.tsField]);
          return (
            <div key={step.key} className="flex items-center gap-2 flex-1 min-w-0">
              <div className={`flex flex-col items-center gap-1 min-w-0 ${done ? "text-white" : "text-neutral-600"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ring-2 ${
                  done
                    ? isCurrent ? "bg-amber-500 text-black ring-amber-500/30" : "bg-emerald-500 text-black ring-emerald-500/20"
                    : "bg-neutral-800 text-neutral-600 ring-neutral-700"
                }`}>
                  {done ? "✓" : i + 1}
                </div>
                <div className="text-[10px] whitespace-nowrap">{step.label}</div>
                {ts && (
                  <div className="text-[9px] text-neutral-500 font-mono whitespace-nowrap">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </div>
                )}
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-neutral-800"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Payout completion badges — tells the admin whether the actual money
// has moved. Only rendered when there's a non-zero leg to show.
function QuotePayoutBadges({ request }: { request: QuoteRequest }) {
  const creditIssued = !!request.credit_issued_at;
  const cashPaid = !!request.cash_paid_at;
  const hasCredit = parseFloat(request.credit_amount ?? "0") > 0;
  const hasCash = parseFloat(request.cash_amount ?? "0") > 0;
  if (!hasCredit && !hasCash) return null;

  return (
    <div className="mt-3 flex items-center gap-2 flex-wrap text-xs">
      {hasCredit && (
        <span className={`px-2 py-1 rounded-full border ${
          creditIssued
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-neutral-800 border-neutral-700 text-neutral-500"
        }`}>
          Credit: {creditIssued
            ? `issued ${new Date(request.credit_issued_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "pending"}
        </span>
      )}
      {hasCash && (
        <span className={`px-2 py-1 rounded-full border ${
          cashPaid
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
            : "bg-neutral-800 border-neutral-700 text-neutral-500"
        }`}>
          Cash: {cashPaid
            ? request.stripe_transfer_id
              ? `Stripe ${request.stripe_transfer_id.slice(0, 10)}…`
              : `paid ${new Date(request.cash_paid_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`
            : "pending"}
        </span>
      )}
    </div>
  );
}
