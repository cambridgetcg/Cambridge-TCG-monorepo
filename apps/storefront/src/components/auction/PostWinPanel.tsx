"use client";

// Post-end panel for auctions. Handles every role × state combination
// past auction.status='ended': winner paying, winner tracking, seller
// shipping, seller waiting, losing bidder, paid-but-not-yet-shipped, etc.
//
// Reads the auction row directly — no extra API calls — so the bid
// panel polling above it already keeps this fresh.

import { useState } from "react";
import type { Auction } from "@/lib/auction/types";
import { formatPrice } from "@/lib/format";
import { buildTrackingUrl } from "@/lib/shipping/carriers";
import {
  getTimelineSteps,
  getCurrentActor,
  isFulfilmentTerminal,
} from "@/lib/auction/fulfilment-timeline";

interface Props {
  auction: Auction;
  sessionUserId: string | null;
  onRefresh: () => void;
}

export default function PostWinPanel({ auction, sessionUserId, onRefresh }: Props) {
  // Derived role — buyer/seller/other — determines what the panel says.
  const isWinner = !!sessionUserId && auction.winner_user_id === sessionUserId;
  const isSeller = !!sessionUserId && auction.seller_user_id === sessionUserId;

  const terminal = isFulfilmentTerminal(auction);
  const currentActor = getCurrentActor(auction);

  return (
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5 space-y-4">
      {/* Header — status-specific */}
      {isWinner && auction.status === "ended" && (
        <WinnerAwaitingPayment auction={auction} />
      )}
      {isWinner && auction.status === "paid" && !terminal && (
        <WinnerInProgress auction={auction} currentActor={currentActor} onRefresh={onRefresh} />
      )}
      {isWinner && terminal && (
        <WinnerComplete auction={auction} />
      )}
      {isSeller && auction.status === "paid" && !terminal && (
        <SellerInProgress auction={auction} currentActor={currentActor} onRefresh={onRefresh} />
      )}
      {isSeller && auction.status === "ended" && (
        <SellerAwaitingBuyer />
      )}
      {!isWinner && !isSeller && auction.status === "ended" && sessionUserId && (
        <LosingBidderEnded />
      )}
      {!isWinner && !isSeller && auction.status === "paid" && (
        <NonPartyPaid auction={auction} />
      )}

      {/* Timeline — visible to buyer and seller once status=paid */}
      {(isWinner || isSeller) && auction.status === "paid" && (
        <FulfilmentTimelineDisplay auction={auction} />
      )}

      {/* Tracking display — once we have a tracking number going the
          right direction, show it to whichever party benefits */}
      {auction.status === "paid" && (
        <TrackingDisplay auction={auction} isSeller={isSeller} isWinner={isWinner} />
      )}
    </div>
  );
}

function WinnerAwaitingPayment({ auction }: { auction: Auction }) {
  const [paying, setPaying] = useState(false);
  async function pay() {
    setPaying(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/pay`, { method: "POST" });
      if (!res.ok) {
        setPaying(false);
        return;
      }
      const { url } = await res.json();
      if (url) window.location.href = url;
    } catch {
      setPaying(false);
    }
  }
  const amount = parseFloat(auction.current_price);
  const deadline = auction.payment_expires_at
    ? new Date(auction.payment_expires_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <>
      <div>
        <p className="text-xs uppercase tracking-wider text-amber-400 font-bold mb-1">You won</p>
        <p className="text-2xl font-bold text-white mb-1">{formatPrice(amount)}</p>
        {deadline && (
          <p className="text-xs text-neutral-400">Payment due by {deadline}</p>
        )}
      </div>
      <button
        onClick={pay}
        disabled={paying}
        className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {paying ? "Opening Stripe…" : "Pay now"}
      </button>
    </>
  );
}

function WinnerInProgress({
  auction, currentActor, onRefresh,
}: { auction: Auction; currentActor: ReturnType<typeof getCurrentActor>; onRefresh: () => void }) {
  const [marking, setMarking] = useState(false);
  async function markReceived() {
    if (!confirm("Confirm you received the card? This releases the seller's payout.")) return;
    setMarking(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/received`, { method: "POST" });
      if (res.ok) onRefresh();
    } finally {
      setMarking(false);
    }
  }

  return (
    <>
      <div>
        <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold mb-1">In progress</p>
        <p className="text-sm text-neutral-300">
          {currentActor === "seller"
            ? auction.is_consignment
              ? "Seller is shipping the card to Cambridge TCG for inspection."
              : "Seller is preparing to ship to you."
            : currentActor === "ctcg"
              ? "The card has arrived at Cambridge TCG. We'll inspect and dispatch to you."
              : currentActor === "buyer"
                ? "The card is on its way to you."
                : "Processing…"}
        </p>
      </div>
      {currentActor === "buyer" && auction.escrow_status === "shipped_to_buyer" && (
        <button
          onClick={markReceived}
          disabled={marking}
          className="w-full py-3 bg-emerald-500 text-black font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
        >
          {marking ? "…" : "Mark card received"}
        </button>
      )}
    </>
  );
}

function WinnerComplete({ auction }: { auction: Auction }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-emerald-400 font-bold mb-1">Delivered</p>
      <p className="text-sm text-neutral-300">
        You received this card on{" "}
        {auction.buyer_received_at
          ? new Date(auction.buyer_received_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
          : "—"}
        .
      </p>
    </div>
  );
}

function SellerInProgress({
  auction, currentActor, onRefresh,
}: { auction: Auction; currentActor: ReturnType<typeof getCurrentActor>; onRefresh: () => void }) {
  const [tracking, setTracking] = useState("");
  const [carrier, setCarrier] = useState("Royal Mail");
  const [shipping, setShipping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsShip = currentActor === "seller" && auction.escrow_status === "awaiting_shipment";

  async function ship() {
    setError(null);
    if (!tracking.trim()) {
      setError("Tracking number required.");
      return;
    }
    setShipping(true);
    try {
      const res = await fetch(`/api/auctions/${auction.id}/ship`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracking: tracking.trim(), carrier }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Ship failed.");
        return;
      }
      onRefresh();
    } finally {
      setShipping(false);
    }
  }

  if (needsShip) {
    return (
      <>
        <div>
          <p className="text-xs uppercase tracking-wider text-amber-400 font-bold mb-1">Your turn</p>
          <p className="text-sm text-neutral-300">
            {auction.is_consignment
              ? "Buyer has paid. Ship the card to Cambridge TCG for inspection."
              : "Buyer has paid. Ship the card directly to the buyer."}
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              className="px-2 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm w-28"
            >
              <option>Royal Mail</option>
              <option>Evri</option>
              <option>DPD</option>
              <option>ParcelForce</option>
              <option>UPS</option>
              <option>FedEx</option>
            </select>
            <input
              value={tracking}
              onChange={(e) => setTracking(e.target.value)}
              placeholder="Tracking number"
              className="flex-1 px-3 py-2 bg-neutral-800 border border-neutral-700 rounded text-sm"
            />
          </div>
          <button
            onClick={ship}
            disabled={shipping || !tracking.trim()}
            className="w-full py-2.5 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50"
          >
            {shipping ? "Saving…" : "Mark as shipped"}
          </button>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </>
    );
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-neutral-400 font-bold mb-1">Tracking</p>
      <p className="text-sm text-neutral-300">
        {currentActor === "ctcg" ? "Cambridge TCG has your card. Inspection in progress."
          : currentActor === "buyer" ? "Buyer has the card. Awaiting their confirmation."
          : auction.buyer_received_at ? "Complete — buyer confirmed receipt."
          : "Processing…"}
      </p>
    </div>
  );
}

function SellerAwaitingBuyer() {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-amber-400 font-bold mb-1">Awaiting payment</p>
      <p className="text-sm text-neutral-300">The winner has been notified and has a window to pay.</p>
    </div>
  );
}

function LosingBidderEnded() {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-1">Auction ended</p>
      <p className="text-sm text-neutral-400">You were outbid. Better luck on the next one.</p>
    </div>
  );
}

function NonPartyPaid({ auction }: { auction: Auction }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-neutral-500 font-bold mb-1">Sold</p>
      <p className="text-sm text-neutral-400">Final price: {formatPrice(parseFloat(auction.current_price))}</p>
    </div>
  );
}

function FulfilmentTimelineDisplay({ auction }: { auction: Auction }) {
  const steps = getTimelineSteps(auction);
  return (
    <div className="bg-neutral-950/40 border border-neutral-800 rounded-lg p-3">
      <div className="flex items-center gap-0 overflow-x-auto">
        {steps.map((step, i) => {
          const ts = auction[step.tsField] as string | null | undefined;
          const done = !!ts;
          const next = steps[i + 1];
          const nextTs = next ? (auction[next.tsField] as string | null | undefined) : null;
          const isCurrent = done && !nextTs && !isFulfilmentTerminal(auction);
          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center min-w-[72px]">
                <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  done
                    ? "bg-emerald-400 text-black"
                    : isCurrent
                      ? "bg-amber-400 text-black ring-2 ring-offset-2 ring-offset-neutral-900 ring-amber-400/40"
                      : "bg-neutral-700 text-neutral-600"
                }`}>
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
              {i < steps.length - 1 && (
                <div className={`h-0.5 w-4 shrink-0 -mt-5 ${done ? "bg-emerald-400/50" : "bg-neutral-700"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TrackingDisplay({ auction, isSeller, isWinner }: { auction: Auction; isSeller: boolean; isWinner: boolean }) {
  // Winners see tracking_to_buyer. Sellers see whichever leg is
  // relevant to them (tracking_to_ctcg for consigned, tracking_to_buyer
  // for direct).
  const legs: Array<{ label: string; tracking: string | null; carrier: string | null }> = [];
  if ((isWinner && auction.tracking_to_buyer) || (isSeller && !auction.is_consignment && auction.tracking_to_buyer)) {
    legs.push({ label: "To you", tracking: auction.tracking_to_buyer, carrier: auction.carrier_to_buyer });
  }
  if (isSeller && auction.is_consignment && auction.tracking_to_ctcg) {
    legs.push({ label: "To Cambridge TCG", tracking: auction.tracking_to_ctcg, carrier: auction.carrier_to_ctcg });
  }
  if (legs.length === 0) return null;

  return (
    <div className="bg-neutral-950/60 border border-neutral-800 rounded-lg p-3 space-y-2">
      {legs.map((leg) => {
        const url = buildTrackingUrl(leg.carrier, leg.tracking);
        return (
          <div key={leg.label} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="text-neutral-500">{leg.label}</span>
            {url ? (
              <a href={url} target="_blank" rel="noopener noreferrer" className="text-amber-400 hover:text-amber-300 font-mono truncate">
                {leg.tracking} ↗
              </a>
            ) : (
              <span className="text-white font-mono truncate">{leg.tracking}</span>
            )}
            {leg.carrier && <span className="text-neutral-600 text-[10px]">via {leg.carrier}</span>}
          </div>
        );
      })}
    </div>
  );
}
