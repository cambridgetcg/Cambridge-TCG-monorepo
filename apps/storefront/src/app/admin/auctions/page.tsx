"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/Toast";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
interface AuctionSummary {
  id: string;
  title: string;
  auction_type: "english" | "dutch" | "buy_now";
  status: string;
  current_price: string;
  starting_price: string;
  buy_now_price: string | null;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
  approval_status?: string | null;
  seller_user_id?: string | null;
  seller_name?: string | null;
  seller_email?: string | null;
  seller_payout?: string | null;
  seller_paid_at?: string | null;
  payout_method?: string | null;
  payout_reference?: string | null;
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-neutral-500/20 text-ink-muted",
  scheduled: "bg-blue-500/20 text-blue-400",
  live: "bg-emerald-500/20 text-secondary",
  ended: "bg-accent/20 text-accent-strong",
  paid: "bg-green-500/20 text-green-400",
  cancelled: "bg-danger/20 text-red-400",
};

const TYPE_LABELS: Record<string, string> = {
  english: "English",
  dutch: "Dutch",
  buy_now: "Buy Now",
};

const APPROVAL_COLORS: Record<string, string> = {
  pending_review: "bg-accent/20 text-accent-strong",
  approved: "bg-emerald-500/20 text-secondary",
  rejected: "bg-danger/20 text-red-400",
};

const STATUSES = ["draft", "scheduled", "live", "ended", "paid", "cancelled"];

export default function AdminAuctionsPage() {
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [rejectNotes, setRejectNotes] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState<string | null>(null);
  const [showPendingOnly, setShowPendingOnly] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const { toast } = useToast();

  const fetchAuctions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auctions?limit=200");
      const data = await res.json();
      setAuctions(data.auctions || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAuctions(); }, [fetchAuctions]);

  async function handleStatusChange(id: string, newStatus: string) {
    setUpdating(id);
    try {
      const res = await fetch(`/api/auctions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setAuctions((prev) =>
          prev.map((a) => (a.id === id ? { ...a, status: newStatus } : a))
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }

  function handleDelete(id: string) {
    setPendingAction(() => async () => {
      try {
        const res = await fetch(`/api/auctions/${id}`, { method: "DELETE" });
        if (res.ok) {
          setAuctions((prev) => prev.filter((a) => a.id !== id));
          setExpanded(null);
        }
      } catch {
        // ignore
      }
    });
    setConfirmOpen(true);
  }

  async function handleApproval(id: string, action: "approve" | "reject") {
    if (action === "reject" && !rejectNotes[id]?.trim()) {
      toast("Please enter rejection notes.", "warning");
      return;
    }
    setApproving(id);
    try {
      const body: { action: string; notes?: string } = { action };
      if (action === "reject" && rejectNotes[id]) {
        body.notes = rejectNotes[id];
      }
      const res = await fetch(`/api/auctions/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        setAuctions((prev) =>
          prev.map((a) =>
            a.id === id
              ? {
                  ...a,
                  approval_status: action === "approve" ? "approved" : "rejected",
                  status: data.auction?.status || (action === "approve" ? "scheduled" : a.status),
                }
              : a
          )
        );
        setRejectNotes((prev) => ({ ...prev, [id]: "" }));
      } else {
        const err = await res.json().catch(() => null);
        toast(err?.error || "Failed to update approval status.", "error");
      }
    } catch {
      toast("Network error.", "error");
    } finally {
      setApproving(null);
    }
  }

  async function handleRecordPayout(id: string) {
    const method = window.prompt(
      "Payout method (bank_transfer / paypal / crypto / stripe_connect / store_credit / other):",
      "bank_transfer"
    );
    if (!method) return;
    const reference = window.prompt("Reference (transaction id, bank ref, etc.) — optional:") ?? "";
    setApproving(id);
    try {
      const res = await fetch(`/api/auctions/${id}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to record payout", "error");
        return;
      }
      setAuctions((prev) =>
        prev.map((a) =>
          a.id === id
            ? {
                ...a,
                seller_paid_at: new Date().toISOString(),
                payout_method: method,
                payout_reference: reference || null,
              }
            : a
        )
      );
    } finally {
      setApproving(null);
    }
  }

  // ── Stats ──
  const total = auctions.length;
  const live = auctions.filter((a) => a.status === "live").length;
  const ended = auctions.filter((a) => a.status === "ended" || a.status === "paid").length;
  const pendingReview = auctions.filter((a) => a.approval_status === "pending_review").length;
  const displayAuctions = showPendingOnly
    ? auctions.filter((a) => a.approval_status === "pending_review")
    : auctions;

  return (
    <AdminShell
      title="Auctions"
      actions={
        <>
          <button
            onClick={fetchAuctions}
            disabled={loading}
            className="px-4 py-2 bg-surface-elevated text-ink text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <Link
            href="/admin/auctions/new"
            className="px-4 py-2 bg-accent text-black text-sm font-bold rounded-lg hover:bg-accent-strong transition"
          >
            New Auction
          </Link>
        </>
      }
    >
      <Audience kind="operator" />
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <button
            onClick={() => setShowPendingOnly(false)}
            className={`bg-surface rounded-xl p-4 text-left transition ${!showPendingOnly ? "ring-2 ring-accent/50" : "hover:bg-surface-elevated/50"}`}
          >
            <p className="text-xs text-ink-faint uppercase tracking-wide">Total</p>
            <p className="text-2xl font-bold text-ink mt-1">{total}</p>
          </button>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">Live</p>
            <p className="text-2xl font-bold text-secondary mt-1">{live}</p>
          </div>
          <div className="bg-surface rounded-xl p-4">
            <p className="text-xs text-ink-faint uppercase tracking-wide">Ended</p>
            <p className="text-2xl font-bold text-accent-strong mt-1">{ended}</p>
          </div>
          <button
            onClick={() => setShowPendingOnly(true)}
            className={`bg-surface rounded-xl p-4 text-left transition ${showPendingOnly ? "ring-2 ring-accent/50" : "hover:bg-surface-elevated/50"}`}
          >
            <p className="text-xs text-ink-faint uppercase tracking-wide">Pending Review</p>
            <p className={`text-2xl font-bold mt-1 ${pendingReview > 0 ? "text-accent-strong" : "text-ink-faint"}`}>{pendingReview}</p>
          </button>
        </div>

        {/* Auction list */}
        {showPendingOnly && (
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm text-accent-strong font-medium">Showing pending review auctions only</span>
            <button
              onClick={() => setShowPendingOnly(false)}
              className="text-xs text-ink-muted hover:text-ink transition underline"
            >
              Show all
            </button>
          </div>
        )}

        {displayAuctions.length === 0 && !loading && (
          <p className="text-ink-faint text-center py-12">
            {showPendingOnly ? "No auctions pending review." : "No auctions yet."}
          </p>
        )}

        <div className="space-y-3">
          {displayAuctions.map((a) => (
            <div key={a.id} className="bg-surface rounded-xl overflow-hidden">
              {/* Row */}
              <button
                onClick={() => setExpanded(expanded === a.id ? null : a.id)}
                className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-surface-elevated/50 transition"
              >
                {a.image_url && (
                  <img
                    src={a.image_url}
                    alt=""
                    className="w-12 h-12 rounded-lg object-cover shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-bold text-ink truncate">{a.title}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[a.status] || "bg-neutral-700 text-ink-muted"
                      }`}
                    >
                      {a.status}
                    </span>
                    {a.seller_user_id && a.approval_status && (
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          APPROVAL_COLORS[a.approval_status] || "bg-neutral-700 text-ink-muted"
                        }`}
                      >
                        {a.approval_status.replace("_", " ")}
                      </span>
                    )}
                    <span className="text-xs text-ink-faint">{TYPE_LABELS[a.auction_type] || a.auction_type}</span>
                  </div>
                  <p className="text-xs text-ink-faint mt-1">
                    {a.bid_count} bid{a.bid_count !== 1 ? "s" : ""} &middot; ends{" "}
                    {new Date(a.ends_at).toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-ink">
                    {formatPrice(parseFloat(a.current_price))}
                  </p>
                  {a.buy_now_price && (
                    <p className="text-xs text-ink-faint">
                      BIN {formatPrice(parseFloat(a.buy_now_price))}
                    </p>
                  )}
                </div>
                <span className="text-neutral-600 text-sm">{expanded === a.id ? "▲" : "▼"}</span>
              </button>

              {/* Expanded detail */}
              {expanded === a.id && (
                <div className="px-4 pb-4 border-t border-border-subtle">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 mb-4 text-sm">
                    <div>
                      <span className="text-ink-faint">Starting Price</span>
                      <p className="text-ink">{formatPrice(parseFloat(a.starting_price))}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Current Price</span>
                      <p className="text-ink">{formatPrice(parseFloat(a.current_price))}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Bids</span>
                      <p className="text-ink">{a.bid_count}</p>
                    </div>
                    <div>
                      <span className="text-ink-faint">Starts</span>
                      <p className="text-ink">
                        {new Date(a.starts_at).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Approval controls for customer auctions pending review */}
                  {a.seller_user_id && a.approval_status === "pending_review" && (
                    <div className="mb-4 p-4 bg-accent/5 border border-accent/20 rounded-xl">
                      <h4 className="text-sm font-bold text-accent-strong mb-3">Customer Auction -- Pending Review</h4>
                      {(a.seller_name || a.seller_email) && (
                        <div className="text-sm text-ink-muted mb-3">
                          <span className="text-ink-faint">Seller: </span>
                          {a.seller_name && <span className="font-medium">{a.seller_name}</span>}
                          {a.seller_email && (
                            <span className="text-ink-muted ml-1">({a.seller_email})</span>
                          )}
                        </div>
                      )}
                      <div className="flex items-center gap-3 flex-wrap">
                        <button
                          onClick={() => handleApproval(a.id, "approve")}
                          disabled={approving === a.id}
                          className="px-4 py-2 bg-emerald-600 text-ink text-sm font-bold rounded-lg hover:bg-emerald-500 transition disabled:opacity-50"
                        >
                          {approving === a.id ? "Processing..." : "Approve"}
                        </button>
                        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                          <input
                            type="text"
                            placeholder="Rejection notes (required)"
                            value={rejectNotes[a.id] || ""}
                            onChange={(e) =>
                              setRejectNotes((prev) => ({ ...prev, [a.id]: e.target.value }))
                            }
                            className="flex-1 px-3 py-2 bg-surface-elevated border border-border-strong rounded-lg text-sm text-ink placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50"
                          />
                          <button
                            onClick={() => handleApproval(a.id, "reject")}
                            disabled={approving === a.id}
                            className="px-4 py-2 bg-red-600 text-ink text-sm font-bold rounded-lg hover:bg-danger transition disabled:opacity-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Status update */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <span className="text-xs text-ink-faint">Update status:</span>
                    {STATUSES.map((st) => (
                      <button
                        key={st}
                        onClick={() => handleStatusChange(a.id, st)}
                        disabled={a.status === st || updating === a.id}
                        className={`text-xs px-2 py-1 rounded-full transition ${
                          a.status === st
                            ? STATUS_COLORS[st] + " font-bold"
                            : "bg-surface-elevated text-ink-muted hover:bg-neutral-700"
                        } disabled:opacity-50`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>

                  {a.status === "draft" && (
                    <button
                      onClick={() => handleDelete(a.id)}
                      className="text-xs px-3 py-1 bg-danger/20 text-red-400 rounded-full hover:bg-danger/30 transition"
                    >
                      Delete Draft
                    </button>
                  )}

                  {/* Seller payout — only for consigned auctions that have been paid by buyer */}
                  {a.seller_user_id && a.status === "paid" && (
                    <div className="mt-3 pt-3 border-t border-border-subtle">
                      <p className="text-xs text-ink-faint uppercase tracking-wide mb-2">Seller Payout</p>
                      {a.seller_paid_at ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm">
                          <p className="text-secondary font-medium">
                            Paid {new Date(a.seller_paid_at).toLocaleDateString("en-GB")}
                            {a.payout_method ? ` via ${a.payout_method}` : ""}
                          </p>
                          {a.payout_reference && (
                            <p className="text-xs text-ink-muted mt-1 font-mono">{a.payout_reference}</p>
                          )}
                        </div>
                      ) : a.seller_payout ? (
                        <button
                          onClick={() => handleRecordPayout(a.id)}
                          disabled={approving === a.id}
                          className="px-4 py-1.5 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                        >
                          Record Payout (£{a.seller_payout})
                        </button>
                      ) : (
                        <p className="text-xs text-ink-faint">Calculate seller_payout first (action: calculate_payout).</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>

        <ConfirmModal
          open={confirmOpen}
          title="Delete Auction"
          message="Delete this draft auction?"
          confirmLabel="Delete"
          variant="danger"
          onConfirm={() => { pendingAction?.(); setConfirmOpen(false); setPendingAction(null); }}
          onCancel={() => { setConfirmOpen(false); setPendingAction(null); }}
        />
    </AdminShell>
  );
}
