"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/format";
import {
  OFFER_STEPS,
  getOfferStep,
  getOfferActor,
  type OfferStatus,
} from "@/lib/market/offer-timeline";

interface OfferRow {
  id: string;
  ask_order_id: string;
  buyer_id: string;
  seller_id: string;
  offer_price: string;
  quantity: number;
  message: string | null;
  status: OfferStatus;
  counter_price: string | null;
  counter_message: string | null;
  created_at: string;
  responded_at: string | null;
  resolved_at: string | null;
  expires_at: string;
  trade_id: string | null;
  card_name: string | null;
  sku: string;
  ask_price: string;
  buyer_username: string | null;
  buyer_name: string | null;
  seller_username: string | null;
  seller_name: string | null;
}

const STATUS_BADGE: Record<OfferStatus, { label: string; className: string }> = {
  pending: { label: "Awaiting response", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  countered: { label: "Counter sent", className: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  accepted: { label: "Accepted", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  declined: { label: "Declined", className: "bg-neutral-500/15 text-neutral-300 border-neutral-500/30" },
  expired: { label: "Expired", className: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
  withdrawn: { label: "Withdrawn", className: "bg-neutral-500/15 text-neutral-400 border-neutral-500/30" },
};

function timeUntil(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "expired";
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "<1h";
  if (hours < 24) return `${hours}h left`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h left`;
}

export default function OffersPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(mode: "incoming" | "outgoing") {
    setLoading(true);
    fetch(`/api/market/offers?mode=${mode}`)
      .then((r) => r.json())
      .then((d) => setOffers(d.offers || []))
      .catch(() => setError("Failed to load offers"))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(tab); }, [tab]);

  async function act(offerId: string, path: string, body?: object) {
    setBusy(offerId);
    setError(null);
    try {
      const res = await fetch(`/api/market/offers/${offerId}/${path}`, {
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
      <h1 className="text-2xl font-black text-white mb-2">Offers</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Negotiate prices on market asks. Sellers have 48 hours to respond before an offer expires.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-4 text-sm text-red-300">
          {error}
        </div>
      )}

      <div className="flex gap-1 bg-neutral-900 rounded-lg p-1 mb-6 w-fit">
        <button
          onClick={() => setTab("incoming")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "incoming" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Incoming
        </button>
        <button
          onClick={() => setTab("outgoing")}
          className={`px-4 py-2 text-sm font-medium rounded-md transition ${
            tab === "outgoing" ? "bg-amber-500 text-black" : "text-neutral-400 hover:text-white"
          }`}
        >
          Outgoing
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : offers.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <p className="text-neutral-400 text-sm">
            {tab === "incoming"
              ? "No offers on your asks yet. They'll appear here when buyers negotiate."
              : "You haven't made any offers yet."}
          </p>
          {tab === "outgoing" && (
            <Link
              href="/market"
              className="inline-block mt-3 text-amber-400 text-xs font-semibold hover:text-amber-300"
            >
              Browse the market →
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {offers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              perspective={tab === "incoming" ? "seller" : "buyer"}
              busy={busy === o.id}
              onAct={(path, body) => act(o.id, path, body)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({
  offer,
  perspective,
  busy,
  onAct,
}: {
  offer: OfferRow;
  perspective: "buyer" | "seller";
  busy: boolean;
  onAct: (path: string, body?: object) => void;
}) {
  const badge = STATUS_BADGE[offer.status];
  const stepIdx = OFFER_STEPS.indexOf(getOfferStep(offer.status));
  const actor = getOfferActor(offer.status);
  const myTurn = actor === perspective;
  const otherLabel = perspective === "seller"
    ? offer.buyer_username ? `@${offer.buyer_username}` : (offer.buyer_name || "Buyer")
    : offer.seller_username ? `@${offer.seller_username}` : (offer.seller_name || "Seller");

  // Toggle counter form
  const [counterPrice, setCounterPrice] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [showCounter, setShowCounter] = useState(false);

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {offer.card_name || offer.sku}
            <span className="text-neutral-500 font-mono text-xs ml-2">{offer.sku}</span>
          </p>
          <p className="text-xs text-neutral-500 mt-0.5">
            {perspective === "seller" ? "From" : "To"} {otherLabel}
            <span className="mx-1.5">·</span>
            {new Date(offer.created_at).toLocaleString("en-GB", {
              day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
            })}
          </p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${badge.className}`}>
          {badge.label}
        </span>
      </div>

      {/* Price summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-neutral-950/40 rounded-lg px-3 py-2">
          <div className="text-neutral-500 uppercase tracking-wide text-[10px]">Ask</div>
          <div className="font-mono font-bold text-neutral-300">{formatPrice(parseFloat(offer.ask_price))}</div>
        </div>
        <div className="bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          <div className="text-amber-400 uppercase tracking-wide text-[10px]">Offer</div>
          <div className="font-mono font-bold text-white">{formatPrice(parseFloat(offer.offer_price))}</div>
        </div>
        <div className={`rounded-lg px-3 py-2 ${offer.counter_price
          ? "bg-blue-500/10 border border-blue-500/20" : "bg-neutral-950/40"}`}>
          <div className={`uppercase tracking-wide text-[10px] ${offer.counter_price ? "text-blue-400" : "text-neutral-500"}`}>
            Counter
          </div>
          <div className="font-mono font-bold text-white">
            {offer.counter_price ? formatPrice(parseFloat(offer.counter_price)) : "—"}
          </div>
        </div>
      </div>

      {/* Messages */}
      {offer.message && (
        <p className="text-xs text-neutral-300 mb-2 italic bg-neutral-950/40 rounded p-2">
          “{offer.message}”
        </p>
      )}
      {offer.counter_message && (
        <p className="text-xs text-blue-300 mb-2 italic bg-blue-500/5 rounded p-2 border border-blue-500/10">
          Seller: “{offer.counter_message}”
        </p>
      )}

      {/* Timeline (3-step) */}
      <div className="flex items-center gap-2 mb-3 mt-1">
        {OFFER_STEPS.map((step, i) => {
          const done = i <= stepIdx;
          const current = i === stepIdx;
          return (
            <div key={step} className="flex items-center gap-2 flex-1 min-w-0">
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${
                  done
                    ? current ? "bg-amber-500 text-black" : "bg-emerald-500 text-black"
                    : "bg-neutral-800 text-neutral-600"
                }`}
              >
                {done ? "✓" : i + 1}
              </div>
              <span className={`text-[10px] capitalize ${done ? "text-white" : "text-neutral-600"}`}>
                {step}
              </span>
              {i < OFFER_STEPS.length - 1 && (
                <div className={`h-px flex-1 ${done ? "bg-emerald-500/40" : "bg-neutral-800"}`} />
              )}
            </div>
          );
        })}
      </div>

      {/* Action row + TTL */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {offer.status === "pending" || offer.status === "countered" ? (
          <span className="text-[10px] text-neutral-500 font-mono">
            {timeUntil(offer.expires_at)}
          </span>
        ) : (
          <span className="text-[10px] text-neutral-500">
            {offer.resolved_at && `Resolved ${new Date(offer.resolved_at).toLocaleDateString("en-GB", {
              day: "numeric", month: "short",
            })}`}
          </span>
        )}

        <div className="flex gap-2 flex-wrap">
          {/* Seller perspective on a pending offer */}
          {perspective === "seller" && offer.status === "pending" && (
            <>
              <button
                disabled={busy}
                onClick={() => onAct("accept")}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {busy ? "..." : "Accept"}
              </button>
              <button
                disabled={busy}
                onClick={() => setShowCounter((s) => !s)}
                className="px-3 py-1.5 text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-md hover:bg-blue-500/25 transition disabled:opacity-50"
              >
                {showCounter ? "Cancel counter" : "Counter"}
              </button>
              <button
                disabled={busy}
                onClick={() => onAct("decline")}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Decline
              </button>
            </>
          )}

          {/* Buyer perspective on a counter offer */}
          {perspective === "buyer" && offer.status === "countered" && (
            <>
              <button
                disabled={busy}
                onClick={() => onAct("accept-counter")}
                className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
              >
                {busy ? "..." : "Accept counter"}
              </button>
              <button
                disabled={busy}
                onClick={() => onAct("withdraw")}
                className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
              >
                Decline counter
              </button>
            </>
          )}

          {/* Buyer perspective on a pending offer */}
          {perspective === "buyer" && offer.status === "pending" && (
            <button
              disabled={busy}
              onClick={() => onAct("withdraw")}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Withdraw
            </button>
          )}

          {/* Trade link if accepted */}
          {offer.status === "accepted" && offer.trade_id && (
            <Link
              href="/account/trades"
              className="px-3 py-1.5 text-xs font-bold bg-amber-500 text-black rounded-md hover:bg-amber-400 transition"
            >
              View trade →
            </Link>
          )}
        </div>
      </div>

      {/* Counter form (seller-only, inline) */}
      {showCounter && perspective === "seller" && offer.status === "pending" && (
        <div className="mt-3 pt-3 border-t border-neutral-800">
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <label className="text-xs text-neutral-500">Counter price (£)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={counterPrice}
              onChange={(e) => setCounterPrice(e.target.value)}
              placeholder={`Between ${parseFloat(offer.offer_price)} and ${parseFloat(offer.ask_price)}`}
              className="flex-1 min-w-[160px] px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-sm"
            />
          </div>
          <textarea
            value={counterMessage}
            onChange={(e) => setCounterMessage(e.target.value)}
            placeholder="Optional message to the buyer"
            rows={2}
            className="w-full px-2 py-1 bg-neutral-800 border border-neutral-700 rounded text-white text-xs resize-none mb-2"
          />
          <div className="flex justify-end">
            <button
              disabled={busy || !counterPrice}
              onClick={() => {
                onAct("counter", {
                  counterPrice: parseFloat(counterPrice),
                  counterMessage: counterMessage || undefined,
                });
                setShowCounter(false);
                setCounterPrice("");
                setCounterMessage("");
              }}
              className="px-3 py-1.5 text-xs font-bold bg-blue-500 text-white rounded-md hover:bg-blue-400 transition disabled:opacity-50"
            >
              {busy ? "..." : "Send counter"}
            </button>
          </div>
        </div>
      )}

      {myTurn && (
        <p className="text-[10px] text-amber-400/80 mt-2">
          {perspective === "seller" ? "Your turn — accept, counter, or decline." : "Your turn — accept the counter or withdraw."}
        </p>
      )}
    </div>
  );
}
