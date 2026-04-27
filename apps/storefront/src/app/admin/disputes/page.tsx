"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  TradeDispute,
  DisputeMessage,
  DisputeEvidence,
  DisputeStatus,
} from "@/lib/trust/types";
import { DISPUTE_REASONS } from "@/lib/trust/types";
import { formatPrice } from "@/lib/format";
import AdminShell from "@/components/admin/AdminShell";
import { DISPUTE_TIMELINE, getDisputeStep, isDisputeTerminal } from "@/lib/trust/dispute-timeline";

const STATUS_COLORS: Record<DisputeStatus, string> = {
  open: "bg-amber-500/20 text-amber-400",
  under_review: "bg-blue-500/20 text-blue-400",
  awaiting_evidence: "bg-amber-500/20 text-amber-400",
  resolved_buyer: "bg-emerald-500/20 text-emerald-400",
  resolved_seller: "bg-emerald-500/20 text-emerald-400",
  resolved_split: "bg-blue-500/20 text-blue-400",
  closed: "bg-neutral-500/20 text-neutral-400",
};

const STATUS_LABELS: Record<DisputeStatus, string> = {
  open: "Open",
  under_review: "Under Review",
  awaiting_evidence: "Awaiting Evidence",
  resolved_buyer: "Resolved (Buyer)",
  resolved_seller: "Resolved (Seller)",
  resolved_split: "Resolved (Split)",
  closed: "Closed",
};

type FilterTab = "all" | "open" | "under_review" | "resolved";

const RESOLUTION_TYPES = [
  { value: "refund_buyer", label: "Refund Buyer" },
  { value: "release_seller", label: "Release to Seller" },
  { value: "split", label: "Split" },
  { value: "return_card", label: "Return Card" },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function reasonLabel(value: string): string {
  const found = DISPUTE_REASONS.find((r) => r.value === value);
  return found ? found.label : value;
}

function isResolved(status: DisputeStatus): boolean {
  return ["resolved_buyer", "resolved_seller", "resolved_split", "closed"].includes(status);
}

export default function AdminDisputesPage() {
  const [disputes, setDisputes] = useState<TradeDispute[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<FilterTab>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Per-dispute detail state
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, DisputeMessage[]>>({});
  const [evidence, setEvidence] = useState<Record<string, DisputeEvidence[]>>({});
  const [newMessage, setNewMessage] = useState<Record<string, string>>({});
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);

  // Resolution state
  const [resolutionType, setResolutionType] = useState<Record<string, string>>({});
  const [refundAmount, setRefundAmount] = useState<Record<string, string>>({});
  const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({});
  const [resolving, setResolving] = useState<string | null>(null);

  const fetchDisputes = useCallback(async () => {
    setLoading(true);
    try {
      let url = "/api/trust/disputes?admin=true";
      if (filter === "open") url += "&status=open";
      else if (filter === "under_review") url += "&status=under_review";
      else if (filter === "resolved") url += "&status=resolved";
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setDisputes(data.disputes || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchDisputes(); }, [fetchDisputes]);

  async function loadDisputeDetail(id: string) {
    setDetailLoading(id);
    try {
      const res = await fetch(`/api/trust/disputes/${id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages((prev) => ({ ...prev, [id]: data.messages || [] }));
        setEvidence((prev) => ({ ...prev, [id]: data.evidence || [] }));
      }
    } catch {
      // ignore
    } finally {
      setDetailLoading(null);
    }
  }

  function handleExpand(id: string) {
    if (expanded === id) {
      setExpanded(null);
      return;
    }
    setExpanded(id);
    if (!messages[id]) loadDisputeDetail(id);
  }

  async function handleSendMessage(disputeId: string) {
    const msg = newMessage[disputeId]?.trim();
    if (!msg) return;
    setSendingMessage(disputeId);
    try {
      const res = await fetch(`/api/trust/disputes/${disputeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, is_admin: true }),
      });
      if (res.ok) {
        setNewMessage((prev) => ({ ...prev, [disputeId]: "" }));
        loadDisputeDetail(disputeId);
      }
    } catch {
      // ignore
    } finally {
      setSendingMessage(null);
    }
  }

  // Intermediate status transitions — under_review / awaiting_evidence.
  // PATCH with { status } (no resolutionType) hits the new branch on
  // the API route; the dispute timestamp columns stamp via COALESCE.
  async function handleSetStatus(disputeId: string, status: "under_review" | "awaiting_evidence") {
    setResolving(disputeId);
    try {
      const res = await fetch(`/api/trust/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setDisputes((prev) =>
          prev.map((d) => (d.id === disputeId ? { ...d, ...data.dispute } : d))
        );
      }
    } finally {
      setResolving(null);
    }
  }

  async function handleResolve(disputeId: string) {
    const type = resolutionType[disputeId];
    const notes = resolutionNotes[disputeId]?.trim();
    if (!type || !notes) return;
    setResolving(disputeId);
    try {
      const body: Record<string, unknown> = {
        resolutionType: type,
        resolutionNotes: notes,
      };
      if ((type === "refund_buyer" || type === "split") && refundAmount[disputeId]) {
        body.refundAmount = refundAmount[disputeId];
      }
      const res = await fetch(`/api/trust/disputes/${disputeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const statusMap: Record<string, DisputeStatus> = {
          refund_buyer: "resolved_buyer",
          release_seller: "resolved_seller",
          split: "resolved_split",
          return_card: "resolved_buyer",
        };
        setDisputes((prev) =>
          prev.map((d) =>
            d.id === disputeId
              ? {
                  ...d,
                  status: statusMap[type] || ("closed" as DisputeStatus),
                  resolution_type: type,
                  resolution_notes: notes,
                  resolved_at: new Date().toISOString(),
                }
              : d
          )
        );
      }
    } catch {
      // ignore
    } finally {
      setResolving(null);
    }
  }

  // ── Stats ──
  const total = disputes.length;
  const openCount = disputes.filter((d) => d.status === "open").length;
  const reviewCount = disputes.filter((d) => d.status === "under_review").length;
  const resolvedCount = disputes.filter((d) => isResolved(d.status)).length;

  return (
    <AdminShell
      title="Dispute Resolution"
      authProbe="/api/trust/disputes?admin=true"
      actions={
        <button
          onClick={fetchDisputes}
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
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Open</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{openCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Under Review</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{reviewCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Resolved</p>
            <p className="text-2xl font-bold text-emerald-400 mt-1">{resolvedCount}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-6">
          {(
            [
              { key: "all", label: "All" },
              { key: "open", label: "Open" },
              { key: "under_review", label: "Under Review" },
              { key: "resolved", label: "Resolved" },
            ] as { key: FilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`text-sm px-4 py-2 rounded-lg transition ${
                filter === tab.key
                  ? "bg-amber-500 text-black font-bold"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* List */}
        {disputes.length === 0 && !loading && (
          <p className="text-neutral-500 text-center py-12">No disputes found.</p>
        )}

        <div className="space-y-3">
          {disputes.map((d) => {
            const disputeMessages = messages[d.id] || [];
            const disputeEvidence = evidence[d.id] || [];
            const isExp = expanded === d.id;

            return (
              <div key={d.id} className="bg-neutral-900 rounded-xl overflow-hidden">
                {/* Row */}
                <button
                  onClick={() => handleExpand(d.id)}
                  className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-800/50 transition"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-sm font-bold text-white">
                        {reasonLabel(d.reason)}
                      </span>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status]}`}
                      >
                        {STATUS_LABELS[d.status]}
                      </span>
                    </div>
                    <p className="text-sm text-neutral-400 mt-1">
                      {d.card_name || "Unknown card"}
                      {d.trade_price ? ` \u00B7 ${formatPrice(parseFloat(d.trade_price))}` : ""}
                      {d.buyer_name && d.seller_name
                        ? ` \u00B7 ${d.buyer_name} / ${d.seller_name}`
                        : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-neutral-500">{formatDate(d.created_at)}</p>
                  </div>
                  <span className="text-neutral-600 text-sm">
                    {isExp ? "\u25B2" : "\u25BC"}
                  </span>
                </button>

                {/* Expanded detail */}
                {isExp && (
                  <div className="px-4 pb-4 border-t border-neutral-800">
                    {detailLoading === d.id && (
                      <p className="text-neutral-500 text-sm py-4">Loading details...</p>
                    )}

                    {/* Trade details */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4 mb-4 text-sm">
                      <div>
                        <span className="text-neutral-500">Card</span>
                        <p className="text-white">{d.card_name || "---"}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Trade Price</span>
                        <p className="text-white">
                          {d.trade_price ? formatPrice(parseFloat(d.trade_price)) : "---"}
                        </p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Buyer</span>
                        <p className="text-white">{d.buyer_name || "---"}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Seller</span>
                        <p className="text-white">{d.seller_name || "---"}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Raised By</span>
                        <p className="text-white">
                          {d.raiser_name || "---"}
                          {d.raiser_email && (
                            <span className="text-neutral-500 ml-1 text-xs">
                              ({d.raiser_email})
                            </span>
                          )}
                        </p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Trade ID</span>
                        <p className="text-white font-mono text-xs">{d.trade_id}</p>
                      </div>
                    </div>

                    {/* Dispute info */}
                    <div className="mb-4 text-sm">
                      <span className="text-neutral-500">Reason</span>
                      <p className="text-white">{reasonLabel(d.reason)}</p>
                      <span className="text-neutral-500 mt-2 block">Description</span>
                      <p className="text-neutral-300">{d.description}</p>
                    </div>

                    {/* Lifecycle timeline */}
                    <AdminDisputeTimeline dispute={d} />

                    {/* Stage transitions — only surface for unresolved disputes */}
                    {!isDisputeTerminal(d.status) && (
                      <div className="flex items-center gap-2 flex-wrap mb-4">
                        <span className="text-xs text-neutral-500">Advance to:</span>
                        {d.status === "open" && (
                          <button
                            onClick={() => handleSetStatus(d.id, "under_review")}
                            disabled={resolving === d.id}
                            className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
                          >
                            → Under review
                          </button>
                        )}
                        {(d.status === "open" || d.status === "under_review") && (
                          <button
                            onClick={() => handleSetStatus(d.id, "awaiting_evidence")}
                            disabled={resolving === d.id}
                            className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 font-medium disabled:opacity-50"
                          >
                            → Awaiting evidence
                          </button>
                        )}
                      </div>
                    )}

                    {/* Resolution info (if resolved) */}
                    {d.resolution_type && (
                      <div className="mb-4 p-3 bg-neutral-800 rounded-lg text-sm">
                        <span className="text-neutral-500">Resolution</span>
                        <p className="text-white">
                          {RESOLUTION_TYPES.find((r) => r.value === d.resolution_type)?.label ||
                            d.resolution_type}
                        </p>
                        {d.refund_amount && (
                          <>
                            <span className="text-neutral-500 mt-1 block">Refund Amount</span>
                            <p className="text-white">
                              {formatPrice(parseFloat(d.refund_amount))}
                            </p>
                          </>
                        )}
                        {d.resolution_notes && (
                          <>
                            <span className="text-neutral-500 mt-1 block">Notes</span>
                            <p className="text-neutral-300">{d.resolution_notes}</p>
                          </>
                        )}
                      </div>
                    )}

                    {/* Evidence gallery */}
                    {disputeEvidence.length > 0 && (
                      <div className="mb-4">
                        <span className="text-xs text-neutral-500 uppercase tracking-wide block mb-2">
                          Evidence
                        </span>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {disputeEvidence.map((ev) => (
                            <a
                              key={ev.id}
                              href={ev.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block group"
                            >
                              <div className="aspect-square bg-neutral-800 rounded-lg overflow-hidden">
                                <img
                                  src={ev.url}
                                  alt={ev.label || "Evidence"}
                                  className="w-full h-full object-cover group-hover:opacity-80 transition"
                                />
                              </div>
                              {ev.label && (
                                <p className="text-xs text-neutral-400 mt-1 truncate">
                                  {ev.label}
                                </p>
                              )}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Message thread */}
                    <div className="mb-4">
                      <span className="text-xs text-neutral-500 uppercase tracking-wide block mb-2">
                        Messages
                      </span>
                      {disputeMessages.length === 0 && detailLoading !== d.id && (
                        <p className="text-sm text-neutral-600">No messages yet.</p>
                      )}
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {disputeMessages.map((msg) => (
                          <div
                            key={msg.id}
                            className={`p-3 rounded-lg text-sm ${
                              msg.is_admin
                                ? "bg-amber-500/10 border border-amber-500/20"
                                : "bg-neutral-800"
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`font-medium ${
                                  msg.is_admin ? "text-amber-400" : "text-white"
                                }`}
                              >
                                {msg.is_admin ? "Admin" : msg.sender_name || "User"}
                              </span>
                              <span className="text-xs text-neutral-500">
                                {formatDateTime(msg.created_at)}
                              </span>
                            </div>
                            <p className="text-neutral-300">{msg.message}</p>
                          </div>
                        ))}
                      </div>

                      {/* Send message */}
                      <div className="flex gap-2 mt-3">
                        <input
                          type="text"
                          value={newMessage[d.id] ?? ""}
                          onChange={(e) =>
                            setNewMessage((prev) => ({ ...prev, [d.id]: e.target.value }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSendMessage(d.id);
                            }
                          }}
                          placeholder="Send a message as admin..."
                          className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                        />
                        <button
                          onClick={() => handleSendMessage(d.id)}
                          disabled={
                            sendingMessage === d.id || !newMessage[d.id]?.trim()
                          }
                          className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                        >
                          {sendingMessage === d.id ? "..." : "Send"}
                        </button>
                      </div>
                    </div>

                    {/* Resolution panel (only for non-resolved) */}
                    {!isResolved(d.status) && (
                      <div className="border-t border-neutral-800 pt-4">
                        <span className="text-xs text-neutral-500 uppercase tracking-wide block mb-3">
                          Resolve Dispute
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                          <div>
                            <label className="text-xs text-neutral-500 block mb-1">
                              Resolution Type
                            </label>
                            <select
                              value={resolutionType[d.id] ?? ""}
                              onChange={(e) =>
                                setResolutionType((prev) => ({
                                  ...prev,
                                  [d.id]: e.target.value,
                                }))
                              }
                              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50 appearance-none"
                            >
                              <option value="">Select...</option>
                              {RESOLUTION_TYPES.map((rt) => (
                                <option key={rt.value} value={rt.value}>
                                  {rt.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {(resolutionType[d.id] === "refund_buyer" ||
                            resolutionType[d.id] === "split") && (
                            <div>
                              <label className="text-xs text-neutral-500 block mb-1">
                                Refund Amount
                              </label>
                              <input
                                type="text"
                                value={refundAmount[d.id] ?? ""}
                                onChange={(e) =>
                                  setRefundAmount((prev) => ({
                                    ...prev,
                                    [d.id]: e.target.value,
                                  }))
                                }
                                placeholder="0.00"
                                className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                              />
                            </div>
                          )}
                        </div>
                        <div className="mb-3">
                          <label className="text-xs text-neutral-500 block mb-1">
                            Resolution Notes (required)
                          </label>
                          <textarea
                            value={resolutionNotes[d.id] ?? ""}
                            onChange={(e) =>
                              setResolutionNotes((prev) => ({
                                ...prev,
                                [d.id]: e.target.value,
                              }))
                            }
                            rows={3}
                            placeholder="Describe the resolution..."
                            className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-none"
                          />
                        </div>
                        <button
                          onClick={() => handleResolve(d.id)}
                          disabled={
                            resolving === d.id ||
                            !resolutionType[d.id] ||
                            !resolutionNotes[d.id]?.trim()
                          }
                          className="px-6 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
                        >
                          {resolving === d.id ? "Resolving..." : "Resolve Dispute"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
    </AdminShell>
  );
}

// Inline timeline for the admin expanded view. Same shape as the
// user-facing DisputeTimeline on /account/trades/[id] — both read
// @/lib/trust/dispute-timeline so new statuses/steps flow to both
// surfaces in one edit. Keeping it local (vs lifting into a shared
// component) because the admin card has slightly different density
// requirements than the customer card.
function AdminDisputeTimeline({ dispute }: { dispute: TradeDispute }) {
  const activeIdx = getDisputeStep(dispute.status);
  const terminal = isDisputeTerminal(dispute.status);
  const anyResolvedStatus = ["resolved_buyer", "resolved_seller", "resolved_split"].includes(dispute.status);

  return (
    <div className="mb-4 bg-neutral-800/40 border border-neutral-700 rounded-lg p-3">
      <div className="flex items-center gap-0 overflow-x-auto">
        {DISPUTE_TIMELINE.map((step, i) => {
          const ts = dispute[step.tsField] as string | null | undefined;
          let done: boolean;
          if (step.key === "resolved") {
            done = anyResolvedStatus && !!dispute.resolved_at;
          } else {
            done = !!ts || i < activeIdx;
          }
          const isCurrent = !terminal && i === activeIdx;

          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center min-w-[80px]">
                <div
                  className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                    done
                      ? "bg-emerald-400 text-black"
                      : isCurrent
                        ? "bg-amber-400 text-black ring-2 ring-offset-2 ring-offset-neutral-800 ring-amber-400/40"
                        : "bg-neutral-700 text-neutral-600"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span className={`text-[9px] mt-1 text-center leading-tight ${
                  done ? "text-emerald-400" : isCurrent ? "text-amber-400" : "text-neutral-600"
                }`}>
                  {step.label}
                </span>
                {ts && done && (
                  <span className="text-[8px] text-neutral-500 font-mono whitespace-nowrap mt-0.5">
                    {new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                )}
              </div>
              {i < DISPUTE_TIMELINE.length - 1 && (
                <div className={`h-0.5 w-5 shrink-0 -mt-5 ${done ? "bg-emerald-400/50" : "bg-neutral-700"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
