"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice, formatTimeUntil } from "@/lib/format";
import { Badge, Palettes } from "@/lib/ui";
import {
  RETURN_STEPS,
  getReturnStep,
  getReturnActor,
  getReturnClosedCopy,
  isReturnTerminal,
  type ReturnStatus,
} from "@/lib/market/return-timeline";
import { buildTrackingUrl } from "@/lib/shipping/carriers";

import { Audience } from "@/lib/ui";
const STATUS_LABELS: Record<ReturnStatus, string> = {
  requested: "Awaiting seller",
  accepted:  "Awaiting your shipment",
  shipping:  "In transit",
  received:  "Awaiting refund",
  refunded:  "Refunded",
  declined:  "Declined",
  cancelled: "Cancelled",
  expired:   "Expired",
};

interface ReturnRow {
  id: string;
  trade_id: string;
  buyer_id: string;
  seller_id: string;
  reason: string;
  message: string | null;
  decline_reason: string | null;
  status: ReturnStatus;
  refund_amount: string | null;
  return_tracking_carrier: string | null;
  return_tracking_number: string | null;
  created_at: string;
  shipped_at: string | null;
  refunded_at: string | null;
  resolved_at: string | null;
  expires_at: string;
  card_name: string | null;
  sku: string;
  trade_price: string;
  trade_quantity: number;
  buyer_username: string | null;
  buyer_name: string | null;
  seller_username: string | null;
  seller_name: string | null;
}

export default function ReturnsPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("outgoing");
  const [returns, setReturns] = useState<ReturnRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(mode: "incoming" | "outgoing") {
    setLoading(true);
    fetch(`/api/market/returns?mode=${mode}`)
      .then((r) => r.json())
      .then((d) => setReturns(d.returns || []))
      .catch(() => setError("Failed to load returns"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(tab); }, [tab]);

  async function act(returnId: string, path: string, body?: object) {
    setBusy(returnId);
    setError(null);
    try {
      const res = await fetch(`/api/market/returns/${returnId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Action failed");
      } else {
        load(tab);
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-white mb-2">Returns</h1>
      <p className="text-sm text-neutral-400 mb-6">
        No-fault returns on completed trades. Different from disputes — for cases where the
        card arrived as described but you've changed your mind. Open within the trade's
        14-day window; sellers have 7 days to respond.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("outgoing")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "outgoing" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          My returns
        </button>
        <button
          onClick={() => setTab("incoming")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "incoming" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Buyers' returns
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : returns.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">
            {tab === "outgoing"
              ? "You haven't opened any returns yet. Eligible completed trades show a Return button on /account/trades."
              : "No buyer return requests on your sales."}
          </p>
          {tab === "outgoing" && (
            <Link
              href="/account/trades"
              className="inline-block mt-3 text-amber-400 text-xs font-semibold hover:text-amber-300"
            >
              View completed trades →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {returns.map((r) => (
            <ReturnCard
              key={r.id}
              row={r}
              perspective={tab === "incoming" ? "seller" : "buyer"}
              busy={busy === r.id}
              onAct={(path, body) => act(r.id, path, body)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ReturnCard({
  row,
  perspective,
  busy,
  onAct,
}: {
  row: ReturnRow;
  perspective: "buyer" | "seller";
  busy: boolean;
  onAct: (path: string, body?: object) => void;
}) {
  const closedCopy = getReturnClosedCopy(row.status);
  const stepKey = getReturnStep(row.status);
  const stepIdx = stepKey ? RETURN_STEPS.indexOf(stepKey) : -1;
  const actor = getReturnActor(row.status);
  const myTurn = actor === perspective;
  const otherLabel = perspective === "seller"
    ? row.buyer_username ? `@${row.buyer_username}` : (row.buyer_name || "Buyer")
    : row.seller_username ? `@${row.seller_username}` : (row.seller_name || "Seller");

  // Inline ship form (buyer-side)
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [showShipForm, setShowShipForm] = useState(false);

  // Inline decline reason (seller-side)
  const [declineText, setDeclineText] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  const trackUrl = buildTrackingUrl(row.return_tracking_carrier, row.return_tracking_number);

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {row.card_name || row.sku}
            <span className="text-neutral-500 font-mono text-xs ml-2">{row.sku}</span>
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {perspective === "seller" ? "From" : "To"} {otherLabel}
            <span className="mx-1.5">·</span>
            Trade total {formatPrice(parseFloat(row.trade_price) * row.trade_quantity)}
            <span className="mx-1.5">·</span>
            Opened {new Date(row.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </p>
        </div>
        <Badge status={row.status} palette={Palettes.ReturnStatusPalette} labels={STATUS_LABELS} />
      </div>

      {/* Buyer's reason + message */}
      <div className="bg-neutral-950/40 rounded p-2 mb-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">Reason</span>
        <p className="text-xs text-neutral-300 mt-0.5">{row.reason.replace(/_/g, " ")}</p>
        {row.message && (
          <p className="text-xs text-neutral-300 italic mt-1">“{row.message}”</p>
        )}
      </div>

      {/* Decline reason if declined */}
      {row.status === "declined" && row.decline_reason && (
        <div className="bg-red-500/5 rounded p-2 mb-2 border border-red-500/10">
          <span className="text-[10px] uppercase tracking-wide text-red-400">Seller declined</span>
          <p className="text-xs text-red-300 italic mt-0.5">“{row.decline_reason}”</p>
        </div>
      )}

      {/* Tracking surface (any status >= shipping) */}
      {row.return_tracking_number && (
        <div className="bg-blue-500/5 rounded p-2 mb-2 border border-blue-500/10">
          <span className="text-[10px] uppercase tracking-wide text-blue-400">Return tracking</span>
          <p className="text-xs mt-0.5">
            {trackUrl ? (
              <a href={trackUrl} target="_blank" rel="noopener noreferrer"
                 className="text-blue-300 hover:text-blue-200 font-mono">
                {row.return_tracking_number} ↗
              </a>
            ) : (
              <span className="text-blue-300 font-mono">{row.return_tracking_number}</span>
            )}
            {row.return_tracking_carrier && (
              <span className="text-neutral-500 ml-2">via {row.return_tracking_carrier}</span>
            )}
          </p>
        </div>
      )}

      {/* Refund amount surface (when accepted+) */}
      {row.refund_amount && (
        <div className="flex items-center gap-2 mb-2 text-xs">
          <span className="text-neutral-500">Refund amount:</span>
          <span className={`font-mono font-bold ${row.status === "refunded" ? "text-emerald-400" : "text-white"}`}>
            {formatPrice(parseFloat(row.refund_amount))}
          </span>
          {row.status === "refunded" && row.refunded_at && (
            <span className="text-[10px] text-neutral-500">
              · issued {new Date(row.refunded_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      )}

      {/* Timeline (5-step) — only on success-path statuses */}
      {!closedCopy && stepIdx >= 0 && (
        <div className="flex items-center gap-2 mb-3 mt-1 overflow-x-auto">
          {RETURN_STEPS.map((step, i) => {
            const done = i <= stepIdx;
            const current = i === stepIdx;
            return (
              <div key={step} className="flex items-center gap-2 flex-1 min-w-0">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                    done
                      ? current ? "bg-amber-500 text-black" : "bg-emerald-500 text-black"
                      : "bg-neutral-800 text-neutral-600"
                  }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span className={`text-[10px] capitalize whitespace-nowrap ${done ? "text-white" : "text-neutral-600"}`}>
                  {step}
                </span>
                {i < RETURN_STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-neutral-800"}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Off-path closed-state copy */}
      {closedCopy && (
        <p className="text-xs text-neutral-500 italic mb-3">{closedCopy}</p>
      )}

      {/* Action row + TTL */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {row.status === "requested" ? (
          <span className="text-[10px] text-neutral-500 font-mono">{formatTimeUntil(row.expires_at)} left</span>
        ) : (
          <span className="text-[10px] text-neutral-500">
            {row.resolved_at && `Resolved ${new Date(row.resolved_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            })}`}
          </span>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* Seller actions on requested */}
          {perspective === "seller" && row.status === "requested" && !showDecline && (
            <>
              <button
                disabled={busy}
                onClick={() => onAct("accept")}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {busy ? "..." : "Accept return"}
              </button>
              <button
                disabled={busy}
                onClick={() => setShowDecline(true)}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}

          {/* Buyer actions on accepted */}
          {perspective === "buyer" && row.status === "accepted" && !showShipForm && (
            <>
              <button
                disabled={busy}
                onClick={() => setShowShipForm(true)}
                className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition disabled:opacity-50"
              >
                Add tracking
              </button>
              <button
                disabled={busy}
                onClick={() => onAct("cancel")}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {/* Seller actions on shipping */}
          {perspective === "seller" && row.status === "shipping" && (
            <button
              disabled={busy}
              onClick={() => onAct("receive")}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {busy ? "..." : "Confirm received"}
            </button>
          )}

          {/* Buyer cancel on requested */}
          {perspective === "buyer" && row.status === "requested" && (
            <button
              disabled={busy}
              onClick={() => onAct("cancel")}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Withdraw
            </button>
          )}

          {/* Trade link if refunded or any terminal state */}
          {isReturnTerminal(row.status) && (
            <Link
              href="/account/trades"
              className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition"
            >
              View trade →
            </Link>
          )}
        </div>
      </div>

      {/* Inline ship form (buyer) */}
      {showShipForm && perspective === "buyer" && row.status === "accepted" && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <p className="text-xs text-neutral-500 mb-2">Enter the carrier and tracking number for your return shipment.</p>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <input
              type="text"
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="Carrier (Royal Mail, UPS, …)"
              className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-sm"
            />
            <input
              type="text"
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
              className="px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-sm font-mono"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowShipForm(false); setCarrier(""); setTracking(""); }}
              className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              disabled={busy || !carrier || !tracking}
              onClick={() => {
                onAct("ship", { carrier, trackingNumber: tracking });
                setShowShipForm(false);
                setCarrier(""); setTracking("");
              }}
              className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition disabled:opacity-50"
            >
              {busy ? "..." : "Submit tracking"}
            </button>
          </div>
        </div>
      )}

      {/* Inline decline form (seller) */}
      {showDecline && perspective === "seller" && row.status === "requested" && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <textarea
            value={declineText}
            onChange={(e) => setDeclineText(e.target.value)}
            placeholder="Optional reason for declining (visible to the buyer)"
            rows={2}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs resize-none mb-2"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowDecline(false); setDeclineText(""); }}
              className="px-3 py-1.5 text-xs font-medium text-neutral-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={() => {
                onAct("decline", declineText.trim() ? { reason: declineText.trim() } : undefined);
                setShowDecline(false);
                setDeclineText("");
              }}
              className="px-3 py-1.5 text-xs font-bold bg-red-500 text-white rounded-md hover:bg-red-400 transition disabled:opacity-50"
            >
              {busy ? "..." : "Decline return"}
            </button>
          </div>
        </div>
      )}

      {myTurn && !showShipForm && !showDecline && (
        <p className="text-[10px] text-amber-400/80 mt-2">
          {perspective === "seller"
            ? row.status === "requested" ? "Your turn — accept or decline." : "Your turn — confirm receipt."
            : "Your turn — add tracking once you've shipped."}
        </p>
      )}
    </div>
  );
}
