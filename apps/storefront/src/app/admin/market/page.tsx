"use client";

import { useState, useEffect, useCallback } from "react";
import { formatPrice } from "@/lib/format";
import type { MarketTrade, EscrowStatus } from "@/lib/market/types";
import type { EscrowTier } from "@/lib/escrow/service-tiers";
import AdminShell from "@/components/admin/AdminShell";

import { Audience } from "@/lib/ui";
import { WhyLink } from "@/lib/ui";
// ── Escrow status config ──

const ESCROW_COLORS: Record<EscrowStatus, string> = {
  awaiting_payment: "bg-amber-500/20 text-amber-400",
  paid: "bg-blue-500/20 text-blue-400",
  awaiting_shipment: "bg-amber-500/20 text-amber-400",
  shipped_to_ctcg: "bg-blue-500/20 text-blue-400",
  received_by_ctcg: "bg-purple-500/20 text-purple-400",
  verified: "bg-emerald-500/20 text-emerald-400",
  shipped_to_buyer: "bg-emerald-500/20 text-emerald-400",
  completed: "bg-green-500/20 text-green-400",
  disputed: "bg-red-500/20 text-red-400",
  refunded: "bg-red-500/20 text-red-400",
  cancelled: "bg-neutral-500/20 text-neutral-400",
};

const ESCROW_LABELS: Record<EscrowStatus, string> = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  awaiting_shipment: "Awaiting Shipment",
  shipped_to_ctcg: "Shipped to CTCG",
  received_by_ctcg: "Received by CTCG",
  verified: "Verified",
  shipped_to_buyer: "Shipped to Buyer",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

// ── Escrow tier badge config ──

const TIER_BADGE: Record<EscrowTier, { label: string; className: string }> = {
  direct: { label: "Direct", className: "bg-emerald-500/20 text-emerald-400" },
  verified: { label: "Verified", className: "bg-blue-500/20 text-blue-400" },
  full_escrow: { label: "Full Escrow", className: "bg-amber-500/20 text-amber-400" },
};

// ── Status filter tabs (unchanged) ──

type StatusFilter = "all" | "awaiting_shipment" | "at_ctcg" | "disputed" | "completed";

const STATUS_FILTER_TABS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "awaiting_shipment", label: "Awaiting Shipment" },
  { key: "at_ctcg", label: "At CTCG" },
  { key: "disputed", label: "Disputed" },
  { key: "completed", label: "Completed" },
];

function matchesStatusFilter(status: EscrowStatus, filter: StatusFilter): boolean {
  switch (filter) {
    case "all":
      return true;
    case "awaiting_shipment":
      return status === "awaiting_shipment" || status === "shipped_to_ctcg";
    case "at_ctcg":
      return status === "received_by_ctcg" || status === "verified";
    case "disputed":
      return status === "disputed";
    case "completed":
      return status === "completed" || status === "refunded";
  }
}

// ── Tier filter tabs ──

type TierFilter = "all" | "full_escrow" | "verified" | "direct";

const TIER_FILTER_TABS: { key: TierFilter; label: string }[] = [
  { key: "all", label: "All Tiers" },
  { key: "full_escrow", label: "Full Escrow" },
  { key: "verified", label: "Verified" },
  { key: "direct", label: "Direct" },
];

function matchesTierFilter(tier: EscrowTier | null, filter: TierFilter): boolean {
  if (filter === "all") return true;
  return tier === filter;
}

// Transitions: current status -> next status (with optional input requirement)
type Transition = {
  next: EscrowStatus;
  label: string;
  input?: "trackingToCtcg" | "trackingToBuyer" | "disputeReason";
};

function getTransitions(status: EscrowStatus): Transition[] {
  const transitions: Transition[] = [];

  switch (status) {
    case "awaiting_payment":
      transitions.push({ next: "paid", label: "Mark Paid" });
      break;
    case "paid":
      transitions.push({ next: "awaiting_shipment", label: "Awaiting Shipment" });
      break;
    case "awaiting_shipment":
      transitions.push({ next: "shipped_to_ctcg", label: "Shipped to CTCG", input: "trackingToCtcg" });
      break;
    case "shipped_to_ctcg":
      transitions.push({ next: "received_by_ctcg", label: "Mark Received" });
      break;
    case "received_by_ctcg":
      transitions.push({ next: "verified", label: "Mark Verified" });
      break;
    case "verified":
      transitions.push({ next: "shipped_to_buyer", label: "Ship to Buyer", input: "trackingToBuyer" });
      break;
    case "shipped_to_buyer":
      transitions.push({ next: "completed", label: "Mark Completed" });
      break;
    case "disputed":
      transitions.push({ next: "refunded", label: "Refund" });
      break;
  }

  // Any non-terminal status can be disputed
  if (!["completed", "refunded", "cancelled", "disputed"].includes(status)) {
    transitions.push({ next: "disputed", label: "Dispute", input: "disputeReason" });
  }

  return transitions;
}

function formatDate(iso: string | null): string {
  if (!iso) return "\u2014";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Escrow tier detail helpers ──

function getTierExplanation(trade: MarketTrade): string {
  const tier = trade.escrow_tier;
  const price = parseFloat(trade.price);
  if (tier === "full_escrow") {
    return `Full escrow: card valued at ${formatPrice(price)}. Seller ships to CTCG for physical inspection before forwarding to buyer.`;
  }
  if (tier === "verified") {
    return `Verified: card valued at ${formatPrice(price)}. Seller uploads photos for CTCG review, then ships directly to buyer.`;
  }
  return `Direct: card valued at ${formatPrice(price)}. Low-value/high-trust trade. Seller ships directly to buyer with tracking.`;
}

// ── Main Component ──

export default function AdminMarketPage() {
  const [trades, setTrades] = useState<MarketTrade[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [tierFilter, setTierFilter] = useState<TierFilter>("full_escrow");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);

  // Per-trade edit state
  const [editNotes, setEditNotes] = useState<Record<string, string>>({});
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const fetchTrades = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/market/trades?admin=true");
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTrades(); }, [fetchTrades]);

  async function handleAdvance(trade: MarketTrade, transition: Transition) {
    // Validate required inputs
    const inputKey = `${trade.id}_${transition.input}`;
    if (transition.input && !inputValues[inputKey]?.trim()) {
      return; // input required but empty
    }

    setUpdating(trade.id);
    try {
      const body: Record<string, string> = { status: transition.next };

      if (transition.input === "trackingToCtcg") {
        body.trackingToCtcg = inputValues[inputKey]?.trim() || "";
      } else if (transition.input === "trackingToBuyer") {
        body.trackingToBuyer = inputValues[inputKey]?.trim() || "";
      }

      const res = await fetch(`/api/market/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        setTrades((prev) =>
          prev.map((t) => (t.id === trade.id ? { ...t, ...data.trade } : t))
        );
        // Clear input
        setInputValues((prev) => {
          const next = { ...prev };
          delete next[inputKey];
          return next;
        });
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }

  async function handleSaveNotes(trade: MarketTrade) {
    setUpdating(trade.id);
    try {
      const res = await fetch(`/api/market/trades/${trade.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: trade.escrow_status, adminNotes: editNotes[trade.id] ?? trade.admin_notes ?? "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setTrades((prev) =>
          prev.map((t) => (t.id === trade.id ? { ...t, ...data.trade } : t))
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }

  async function handleRecordPayout(tradeId: string) {
    // Two-step prompt — admin-only surface, keep it simple. Method is the
    // free-form provider name; reference is whatever the admin pasted from
    // their banking/PayPal/Stripe Connect dashboard.
    const method = window.prompt(
      "Payout method (bank_transfer / paypal / crypto / stripe_connect / store_credit / other):",
      "bank_transfer"
    );
    if (!method) return;
    const reference = window.prompt("Reference (transaction id, bank ref, etc.) — optional:") ?? "";
    setUpdating(tradeId);
    try {
      const res = await fetch(`/api/market/trades/${tradeId}/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, reference: reference || undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        window.alert(data.error || "Failed to record payout");
        return;
      }
      // Reflect locally so the button hides without a refetch
      setTrades((prev) =>
        prev.map((t) =>
          t.id === tradeId
            ? { ...t, seller_paid_at: new Date().toISOString(), payout_method: method, payout_reference: reference || null }
            : t
        )
      );
    } finally {
      setUpdating(null);
    }
  }

  async function handlePhotoAction(tradeId: string, action: "approve" | "reject") {
    setUpdating(tradeId);
    try {
      const res = await fetch(`/api/market/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoReview: action }),
      });
      if (res.ok) {
        const data = await res.json();
        setTrades((prev) =>
          prev.map((t) => (t.id === tradeId ? { ...t, ...data.trade } : t))
        );
      }
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }


  // ── Stats ──
  const totalTrades = trades.length;
  const awaitingShipment = trades.filter((t) => t.escrow_status === "awaiting_shipment").length;
  const needsInspection = trades.filter(
    (t) => t.escrow_tier === "full_escrow" && t.escrow_status === "received_by_ctcg"
  ).length;
  const photoReview = trades.filter(
    (t) => t.escrow_tier === "verified" && t.requires_photos && t.escrow_status === "awaiting_shipment"
  ).length;
  const disputedCount = trades.filter((t) => t.escrow_status === "disputed").length;
  const completedCount = trades.filter((t) => t.escrow_status === "completed").length;

  // ── Filtered trades ──
  const filtered = trades.filter(
    (t) => matchesStatusFilter(t.escrow_status, statusFilter) && matchesTierFilter(t.escrow_tier, tierFilter)
  );

  // Separate monitoring (direct, non-disputed) from action-needed trades
  const actionNeeded = filtered.filter(
    (t) => t.escrow_tier !== "direct" || t.escrow_status === "disputed"
  );
  const monitoring = filtered.filter(
    (t) => t.escrow_tier === "direct" && t.escrow_status !== "disputed"
  );

  return (
    <AdminShell
      title="P2P Market Trades"
      authProbe="/api/market/trades?admin=true"
      actions={
        <button
          onClick={fetchTrades}
          disabled={loading}
          className="px-4 py-2 bg-neutral-800 text-white text-sm rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh"}
        </button>
      }
    >
      <Audience kind="operator" />
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Trades</p>
            <p className="text-2xl font-bold text-white mt-1">{totalTrades}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Awaiting Shipment</p>
            <p className="text-2xl font-bold text-amber-400 mt-1">{awaitingShipment}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Needs Inspection</p>
            <p className="text-2xl font-bold text-purple-400 mt-1">{needsInspection}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Photo Review</p>
            <p className="text-2xl font-bold text-blue-400 mt-1">{photoReview}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Disputed</p>
            <p className="text-2xl font-bold text-red-400 mt-1">{disputedCount}</p>
          </div>
          <div className="bg-neutral-900 rounded-xl p-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Completed</p>
            <p className="text-2xl font-bold text-green-400 mt-1">{completedCount}</p>
          </div>
        </div>

        {/* Tier Filter Tabs */}
        <div className="mb-4">
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Escrow Tier</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {TIER_FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setTierFilter(tab.key)}
                className={`text-sm px-4 py-2 rounded-lg transition whitespace-nowrap ${
                  tierFilter === tab.key
                    ? "bg-amber-500 text-black font-bold"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {tab.label}
                {tab.key !== "all" && (
                  <span className="ml-1.5 text-xs opacity-70">
                    ({trades.filter((t) => t.escrow_tier === tab.key).length})
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="mb-6">
          <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Status</p>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {STATUS_FILTER_TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`text-sm px-4 py-2 rounded-lg transition whitespace-nowrap ${
                  statusFilter === tab.key
                    ? "bg-amber-500 text-black font-bold"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Trade List — Action Needed (Tier 2 & 3, plus any disputed) */}
        {actionNeeded.length === 0 && monitoring.length === 0 && !loading && (
          <p className="text-neutral-500 text-center py-12">No trades found.</p>
        )}

        {actionNeeded.length > 0 && (
          <>
            {tierFilter === "all" && (
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-3">
                Needs Attention ({actionNeeded.length})
              </p>
            )}
            <div className="space-y-3 mb-8">
              {actionNeeded.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  updating={updating}
                  editNotes={editNotes}
                  setEditNotes={setEditNotes}
                  inputValues={inputValues}
                  setInputValues={setInputValues}
                  onAdvance={handleAdvance}
                  onSaveNotes={handleSaveNotes}
                  onPhotoAction={handlePhotoAction}
                  onRecordPayout={handleRecordPayout}
                />
              ))}
            </div>
          </>
        )}

        {/* Monitoring Section — Direct trades (no admin action needed unless disputed) */}
        {monitoring.length > 0 && (
          <>
            <div className="border-t border-neutral-800 pt-6 mb-3">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-1">
                Monitoring ({monitoring.length})
              </p>
              <p className="text-xs text-neutral-600 mb-3">
                Direct trades — no admin action needed unless disputed.
              </p>
            </div>
            <div className="space-y-3 opacity-75">
              {monitoring.map((trade) => (
                <TradeRow
                  key={trade.id}
                  trade={trade}
                  expanded={expanded}
                  setExpanded={setExpanded}
                  updating={updating}
                  editNotes={editNotes}
                  setEditNotes={setEditNotes}
                  inputValues={inputValues}
                  setInputValues={setInputValues}
                  onAdvance={handleAdvance}
                  onSaveNotes={handleSaveNotes}
                  onPhotoAction={handlePhotoAction}
                  onRecordPayout={handleRecordPayout}
                />
              ))}
            </div>
          </>
        )}
    </AdminShell>
  );
}

// ── Trade Row Component ──

function TradeRow({
  trade,
  expanded,
  setExpanded,
  updating,
  editNotes,
  setEditNotes,
  inputValues,
  setInputValues,
  onAdvance,
  onSaveNotes,
  onPhotoAction,
  onRecordPayout,
}: {
  trade: MarketTrade;
  expanded: string | null;
  setExpanded: (id: string | null) => void;
  updating: string | null;
  editNotes: Record<string, string>;
  setEditNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  inputValues: Record<string, string>;
  setInputValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onAdvance: (trade: MarketTrade, transition: Transition) => void;
  onSaveNotes: (trade: MarketTrade) => void;
  onPhotoAction: (tradeId: string, action: "approve" | "reject") => void;
  onRecordPayout: (tradeId: string) => void;
}) {
  const isExpanded = expanded === trade.id;
  const transitions = getTransitions(trade.escrow_status);
  const notesValue = editNotes[trade.id] ?? trade.admin_notes ?? "";
  const tierBadge = trade.escrow_tier ? TIER_BADGE[trade.escrow_tier] : null;

  return (
    <div className="bg-neutral-900 rounded-xl overflow-hidden">
      {/* Collapsed Row */}
      <button
        onClick={() => setExpanded(isExpanded ? null : trade.id)}
        className="w-full px-4 py-4 flex items-center gap-4 text-left hover:bg-neutral-800/50 transition"
      >
        {/* Card Thumbnail */}
        {trade.image_url ? (
          <img
            src={trade.image_url}
            alt={trade.card_name || "Card"}
            className="w-10 h-14 object-cover rounded shrink-0"
          />
        ) : (
          <div className="w-10 h-14 bg-neutral-800 rounded shrink-0 flex items-center justify-center">
            <span className="text-neutral-600 text-xs">?</span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-bold text-white truncate">
              {trade.card_name || trade.sku}
            </span>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                ESCROW_COLORS[trade.escrow_status]
              }`}
            >
              {ESCROW_LABELS[trade.escrow_status]}
            </span>
            {tierBadge && (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${tierBadge.className}`}>
                {tierBadge.label}
              </span>
            )}
          </div>
          <p className="text-sm text-neutral-400 mt-1 truncate">
            <span className="text-neutral-500">Seller:</span> {trade.seller_name || "Unknown"}{" "}
            <span className="text-neutral-600 mx-1">-&gt;</span>{" "}
            <span className="text-neutral-500">Buyer:</span> {trade.buyer_name || "Unknown"}
          </p>
        </div>

        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-white">
            {formatPrice(parseFloat(trade.price))}
          </p>
          <p className="text-xs text-neutral-500">
            {formatPrice(parseFloat(trade.commission_amount))} fee
          </p>
        </div>

        <div className="text-right shrink-0 hidden sm:block">
          <p className="text-xs text-neutral-500">
            {formatDate(trade.created_at)}
          </p>
        </div>

        <span className="text-neutral-600 text-sm">{isExpanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      {/* Expanded Detail */}
      {isExpanded && (
        <div className="px-4 pb-4 border-t border-neutral-800">
          {/* Escrow Tier Info */}
          {trade.escrow_tier && (
            <div className="mt-4 mb-4 bg-neutral-800/40 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-2">
                {tierBadge && (
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${tierBadge.className}`}>
                    {tierBadge.label}
                  </span>
                )}
                <p className="text-xs text-neutral-400">{getTierExplanation(trade)}</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-neutral-500">Ships To</span>
                  <p className="text-neutral-300">{trade.seller_ships_to === "ctcg" ? "CTCG" : "Buyer"}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Dispute Window</span>
                  <p className="text-neutral-300">{trade.dispute_window_hours ?? "\u2014"}h</p>
                </div>
                <div>
                  <span className="text-neutral-500">Payout Hold</span>
                  <p className="text-neutral-300">{trade.payout_hold_days ?? "\u2014"} day{(trade.payout_hold_days ?? 0) !== 1 ? "s" : ""}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Photos Required</span>
                  <p className="text-neutral-300">{trade.requires_photos ? "Yes" : "No"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Tier-specific sections */}

          {/* Verified tier: Photo Review */}
          {trade.escrow_tier === "verified" && trade.requires_photos && (
            <div className="mb-4 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs text-blue-400 uppercase tracking-wide font-medium mb-2">Photo Review</p>
              <p className="text-sm text-neutral-400 mb-3">
                Seller must upload card photos for review before shipping. Approve to let the seller ship, or reject to request new photos.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => onPhotoAction(trade.id, "approve")}
                  disabled={updating === trade.id}
                  className="text-sm px-4 py-1.5 rounded-lg font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition disabled:opacity-50"
                >
                  Approve Photos
                </button>
                <button
                  onClick={() => onPhotoAction(trade.id, "reject")}
                  disabled={updating === trade.id}
                  className="text-sm px-4 py-1.5 rounded-lg font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition disabled:opacity-50"
                >
                  Reject Photos
                </button>
              </div>
            </div>
          )}

          {/* Full Escrow tier: Inspection Checklist */}
          {trade.escrow_tier === "full_escrow" && trade.requires_inspection && (
            <div className="mb-4 bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
              <p className="text-xs text-amber-400 uppercase tracking-wide font-medium mb-2">Inspection Checklist</p>
              <ul className="text-sm text-neutral-400 space-y-1.5">
                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-neutral-600 inline-block shrink-0" />
                  Card received and matches listing description
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-neutral-600 inline-block shrink-0" />
                  Condition verified (front and back inspection)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-neutral-600 inline-block shrink-0" />
                  Authenticity check passed (no proxies/fakes)
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-neutral-600 inline-block shrink-0" />
                  Photos taken for records
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded border border-neutral-600 inline-block shrink-0" />
                  Re-sleeved / re-top-loaded for shipping to buyer
                </li>
              </ul>
            </div>
          )}

          {/* Direct tier: Minimal info */}
          {trade.escrow_tier === "direct" && (
            <div className="mb-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg p-3">
              <p className="text-xs text-emerald-400 uppercase tracking-wide font-medium mb-2">Direct Trade</p>
              <p className="text-sm text-neutral-400">
                No admin action needed. Seller ships directly to buyer. Only intervene if a dispute is raised.
              </p>
              {trade.tracking_to_buyer && (
                <p className="text-sm text-neutral-300 mt-2 font-mono">
                  Tracking: {trade.tracking_to_buyer}
                </p>
              )}
            </div>
          )}

          {/* Buyer / Seller Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 mb-4">
            <div className="bg-neutral-800/50 rounded-lg p-3">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Seller</p>
              <p className="text-sm text-white">{trade.seller_name || "Unknown"}</p>
              <p className="text-sm text-neutral-400">{trade.seller_email || "\u2014"}</p>
              <p className="text-xs text-neutral-500 mt-1">Payout: {formatPrice(parseFloat(trade.seller_payout))}</p>
            </div>
            <div className="bg-neutral-800/50 rounded-lg p-3">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Buyer</p>
              <p className="text-sm text-white">{trade.buyer_name || "Unknown"}</p>
              <p className="text-sm text-neutral-400">{trade.buyer_email || "\u2014"}</p>
              <p className="text-xs text-neutral-500 mt-1">Paid: {formatPrice(parseFloat(trade.price))}</p>
            </div>
          </div>

          {/* Trade Details */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4 text-sm">
            <div>
              <span className="text-neutral-500">Quantity</span>
              <p className="text-white">{trade.quantity}</p>
            </div>
            <div>
              <span className="text-neutral-500">Commission Rate</span>
              <p className="text-white">{(parseFloat(trade.commission_rate) * 100).toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-neutral-500">SKU</span>
              <p className="text-white font-mono text-xs">{trade.sku}</p>
            </div>
            <div>
              <span className="text-neutral-500">Stripe PI</span>
              <p className="text-white font-mono text-xs truncate">{trade.stripe_payment_intent || "\u2014"}</p>
            </div>
          </div>

          {/* Tracking Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-4 text-sm">
            <div>
              <span className="text-neutral-500">Tracking to CTCG</span>
              <p className="text-white font-mono text-xs">{trade.tracking_to_ctcg || "\u2014"}</p>
            </div>
            <div>
              <span className="text-neutral-500">Tracking to Buyer</span>
              <p className="text-white font-mono text-xs">{trade.tracking_to_buyer || "\u2014"}</p>
            </div>
          </div>

          {/* Escrow Timeline */}
          <div className="mb-4">
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Escrow Timeline</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Created</span>
                <p className="text-neutral-300">{formatDate(trade.created_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Buyer Paid</span>
                <p className="text-neutral-300">{formatDate(trade.buyer_paid_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Seller Shipped</span>
                <p className="text-neutral-300">{formatDate(trade.seller_shipped_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">CTCG Received</span>
                <p className="text-neutral-300">{formatDate(trade.ctcg_received_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Verified</span>
                <p className="text-neutral-300">{formatDate(trade.ctcg_verified_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Shipped to Buyer</span>
                <p className="text-neutral-300">{formatDate(trade.shipped_to_buyer_at)}</p>
              </div>
              <div className="bg-neutral-800/30 rounded p-2">
                <span className="text-neutral-500">Completed</span>
                <p className="text-neutral-300">{formatDate(trade.completed_at)}</p>
              </div>
              {trade.dispute_reason && (
                <div className="bg-red-500/10 rounded p-2">
                  <span className="text-red-400">Dispute Reason</span>
                  <p className="text-red-300">{trade.dispute_reason}</p>
                </div>
              )}
            </div>
          </div>

          {/* Escrow Actions */}
          {transitions.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Actions</p>
              <div className="flex flex-col gap-2">
                {transitions.map((transition) => {
                  const inputKey = `${trade.id}_${transition.input}`;
                  return (
                    <div key={transition.next} className="flex items-center gap-2 flex-wrap">
                      {transition.input === "trackingToCtcg" && (
                        <input
                          type="text"
                          placeholder="Tracking number to CTCG"
                          value={inputValues[inputKey] || ""}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [inputKey]: e.target.value }))
                          }
                          className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 w-64"
                        />
                      )}
                      {transition.input === "trackingToBuyer" && (
                        <input
                          type="text"
                          placeholder="Tracking number to buyer"
                          value={inputValues[inputKey] || ""}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [inputKey]: e.target.value }))
                          }
                          className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 w-64"
                        />
                      )}
                      {transition.input === "disputeReason" && (
                        <input
                          type="text"
                          placeholder="Dispute reason"
                          value={inputValues[inputKey] || ""}
                          onChange={(e) =>
                            setInputValues((prev) => ({ ...prev, [inputKey]: e.target.value }))
                          }
                          className="px-3 py-1.5 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-red-500/50 w-64"
                        />
                      )}
                      <button
                        onClick={() => onAdvance(trade, transition)}
                        disabled={
                          updating === trade.id ||
                          (!!transition.input && !inputValues[inputKey]?.trim())
                        }
                        className={`text-sm px-4 py-1.5 rounded-lg font-medium transition disabled:opacity-50 ${
                          transition.next === "disputed" || transition.next === "refunded"
                            ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                            : "bg-amber-500/20 text-amber-400 hover:bg-amber-500/30"
                        }`}
                      >
                        {transition.label}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Seller payout — surfaces only after the trade is completed.
              Two-prompt flow records what was paid out off-platform; the
              backend stamps seller_paid_at + method/reference and emails
              the seller a receipt. */}
          {trade.escrow_status === "completed" && (
            <div className="mb-4">
              <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Seller Payout</p>
              {trade.seller_paid_at ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-sm">
                  <p className="text-emerald-400 font-medium">
                    Paid {new Date(trade.seller_paid_at).toLocaleDateString("en-GB")}
                    {trade.payout_method ? ` via ${trade.payout_method}` : ""}
                  </p>
                  {trade.payout_reference && (
                    <p className="text-xs text-neutral-400 mt-1 font-mono">{trade.payout_reference}</p>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => onRecordPayout(trade.id)}
                  disabled={updating === trade.id}
                  className="px-4 py-1.5 bg-emerald-500 text-black text-sm font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                >
                  Record Payout (£{trade.seller_payout})
                </button>
              )}
            </div>
          )}

          {/* Admin Notes */}
          <div>
            <p className="text-xs text-neutral-500 uppercase tracking-wide mb-2">Admin Notes</p>
            <textarea
              value={notesValue}
              onChange={(e) =>
                setEditNotes((prev) => ({ ...prev, [trade.id]: e.target.value }))
              }
              rows={3}
              placeholder="Internal notes about this trade..."
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 resize-y"
            />
            <button
              onClick={() => onSaveNotes(trade)}
              disabled={updating === trade.id}
              className="mt-2 px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
            >
              {updating === trade.id ? "Saving..." : "Save Notes"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

          {/* Transparency: derived scores link to methodology */}
          <WhyLink href="https://cambridgetcg.com/methodology/commission-rate" />