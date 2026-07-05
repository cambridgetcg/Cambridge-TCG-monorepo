"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatTimeUntil } from "@/lib/format";
import { Badge, Palettes, Consequences, MessageButton, Money, TrustTier } from "@/lib/ui";
import type { Consequence } from "@/lib/ui";
import { Audience } from "@/lib/ui";
import {
  OFFER_STEPS,
  getOfferStep,
  getOfferActor,
  type OfferStatus,
} from "@/lib/market/offer-timeline";

const STATUS_LABELS: Record<OfferStatus, string> = {
  pending:   "Awaiting response",
  countered: "Counter sent",
  accepted:  "Accepted",
  declined:  "Declined",
  expired:   "Expired",
  withdrawn: "Withdrawn",
};

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
  // Counterparty reputation (global free trade, 2026-06-10): only the
  // counterparty side of each list query is populated.
  buyer_tier: string | null;
  buyer_review_count: number | null;
  seller_tier: string | null;
  seller_review_count: number | null;
}

// The caller's OWN resolved P2P commission rate, served by the offers API
// (the min(membership, trust) combine + per-item cap). Only meaningful
// when the viewer is the seller of the trade being previewed.
interface ViewerCommission {
  rate: number;
  source: "membership" | "trust" | "default";
  capGbp: number;
}

export default function OffersPage() {
  const [tab, setTab] = useState<"incoming" | "outgoing">("incoming");
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [viewerCommission, setViewerCommission] = useState<ViewerCommission | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load(mode: "incoming" | "outgoing") {
    setLoading(true);
    fetch(`/api/market/offers?mode=${mode}`)
      .then((r) => r.json())
      .then((d) => {
        setOffers(d.offers || []);
        if (d.viewerCommission) setViewerCommission(d.viewerCommission);
      })
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
      <Audience kind="consumer" />
      <h1 className="text-2xl font-black text-white mb-2">Offers</h1>
      <p className="text-sm text-neutral-400 mb-6">
        Negotiate prices on market asks. Sellers respond within their declared response window
        (48 hours by default) — each offer below shows its own expiry.
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
              viewerCommission={viewerCommission}
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
  viewerCommission,
  busy,
  onAct,
}: {
  offer: OfferRow;
  perspective: "buyer" | "seller";
  viewerCommission: ViewerCommission | null;
  busy: boolean;
  onAct: (path: string, body?: object) => void;
}) {
  const stepIdx = OFFER_STEPS.indexOf(getOfferStep(offer.status));
  const actor = getOfferActor(offer.status);
  const myTurn = actor === perspective;
  // Counterparty identity + reputation (global free trade, 2026-06-10):
  // the row links to the profile, chips the trust tier, and offers a
  // direct message line — reputation visible at the point of trade.
  const counterpartyId = perspective === "seller" ? offer.buyer_id : offer.seller_id;
  const otherUsername = perspective === "seller" ? offer.buyer_username : offer.seller_username;
  const otherTier = perspective === "seller" ? offer.buyer_tier : offer.seller_tier;
  const otherReviews = perspective === "seller" ? offer.buyer_review_count : offer.seller_review_count;
  const otherLabel = perspective === "seller"
    ? offer.buyer_username ? `@${offer.buyer_username}` : (offer.buyer_name || "Buyer")
    : offer.seller_username ? `@${offer.seller_username}` : (offer.seller_name || "Seller");

  // Toggle counter form
  const [counterPrice, setCounterPrice] = useState("");
  const [counterMessage, setCounterMessage] = useState("");
  const [showCounter, setShowCounter] = useState(false);

  // Pre-action consequences confirmation (Wave 3 of the All-Aboard plan).
  // Holds the path of the action being confirmed, or null. The Consequences
  // pill renders while non-null; on confirm we fire the actual action.
  const [confirming, setConfirming] = useState<null | "accept" | "accept-counter">(null);

  // Compute the deltas the buyer/seller is about to commit to. Honest:
  // the seller's fee uses THEIR resolved rate (min of membership and
  // trust, per-item cap) served by the API — never a hardcoded platform
  // number. The buyer's view can't know the counterparty seller's rate,
  // so it names its own delta (what the buyer pays) and links the
  // methodology instead of guessing the seller's fee.
  function consequencesFor(path: "accept" | "accept-counter"): Consequence[] {
    const price =
      path === "accept-counter" && offer.counter_price
        ? parseFloat(offer.counter_price)
        : parseFloat(offer.offer_price);
    const qty = offer.quantity;
    const gross = Math.round(price * qty * 100) / 100;
    const list: Consequence[] = [];

    if (perspective === "seller" && viewerCommission) {
      // Same formula acceptance applies server-side: min(gross × rate, cap).
      const fee = Math.min(
        Math.round(gross * viewerCommission.rate * 100) / 100,
        viewerCommission.capGbp,
      );
      const sellerNet = Math.round((gross - fee) * 100) / 100;
      const ratePct = `${+(viewerCommission.rate * 100).toFixed(2)}%`;
      const rateLabel =
        viewerCommission.source === "membership" ? `${ratePct} membership rate`
        : viewerCommission.source === "trust" ? `${ratePct} trust rate`
        : `${ratePct} base rate`;
      list.push({
        label: `You receive (after ${rateLabel})`,
        delta: <Money value={sellerNet} />,
        tone: "emerald",
        methodology: "/methodology/offers",
        detail: (
          <>
            Gross <Money value={gross} /> − <Money value={fee} /> commission
            {fee === viewerCommission.capGbp ? <> (capped at <Money value={viewerCommission.capGbp} />)</> : null}
          </>
        ),
      });
    } else if (perspective === "seller") {
      // Rate not loaded (fetch raced or failed) — no number is better
      // than a wrong one.
      list.push({
        label: "You receive the agreed price minus your resolved commission",
        delta: <Money value={gross} />,
        methodology: "/methodology/offers",
        detail: "Your exact rate (5–8%, capped £50) depends on your trust score and membership tier.",
      });
    } else {
      list.push({
        label: "You pay",
        delta: <Money value={gross} />,
        tone: "amber",
        methodology: "/methodology/offers",
        detail: "The seller's commission comes out of their side — you pay the agreed price.",
      });
    }

    list.push({
      label: "Trust score on completion",
      delta: "+0.4 (estimated)",
      tone: "emerald",
      methodology: "/methodology/trust-score",
    });
    if (path === "accept-counter") {
      list.push({
        label: "Payment deadline",
        delta: "your declared response window",
        methodology: "/methodology/response-windows",
        detail: "Default 24h; longer if you've set a custom response window.",
      });
    }
    return list;
  }

  return (
    <div className="bg-neutral-900 rounded-xl p-4 border border-neutral-800">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">
            {offer.card_name || offer.sku}
            <span className="text-neutral-500 font-mono text-xs ml-2">{offer.sku}</span>
          </p>
          <p className="text-xs text-neutral-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
            <span>
              {perspective === "seller" ? "From" : "To"}{" "}
              {otherUsername ? (
                <Link
                  href={`/u/${otherUsername}`}
                  className="text-amber-400 hover:text-amber-300 hover:underline"
                >
                  @{otherUsername}
                </Link>
              ) : (
                otherLabel
              )}
            </span>
            {otherTier && <TrustTier name={otherTier} score={null} showScore={false} />}
            {otherReviews != null && (
              <span className="font-mono">
                {otherReviews} review{otherReviews !== 1 ? "s" : ""}
              </span>
            )}
            <span>·</span>
            <span>
              {new Date(offer.created_at).toLocaleString("en-GB", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </span>
          </p>
        </div>
        <Badge status={offer.status} palette={Palettes.OfferStatusPalette} labels={STATUS_LABELS} />
      </div>

      {/* Price summary */}
      <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
        <div className="bg-neutral-950/40 rounded-lg px-3 py-2">
          <div className="text-neutral-500 uppercase tracking-wide text-[10px]">Ask</div>
          <div className="font-mono font-bold text-neutral-300"><Money value={parseFloat(offer.ask_price)} /></div>
        </div>
        <div className="bg-amber-500/10 rounded-lg px-3 py-2 border border-amber-500/20">
          <div className="text-amber-400 uppercase tracking-wide text-[10px]">Offer</div>
          <div className="font-mono font-bold text-white"><Money value={parseFloat(offer.offer_price)} /></div>
        </div>
        <div className={`rounded-lg px-3 py-2 ${offer.counter_price
          ? "bg-blue-500/10 border border-blue-500/20" : "bg-neutral-950/40"}`}>
          <div className={`uppercase tracking-wide text-[10px] ${offer.counter_price ? "text-blue-400" : "text-neutral-500"}`}>
            Counter
          </div>
          <div className="font-mono font-bold text-white">
            {offer.counter_price ? <Money value={parseFloat(offer.counter_price)} /> : "—"}
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
            {formatTimeUntil(offer.expires_at)} left
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
                onClick={() => setConfirming("accept")}
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
                onClick={() => setConfirming("accept-counter")}
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

          {/* Message the counterparty — negotiation has a voice channel
              regardless of offer state. */}
          <MessageButton
            otherUserId={counterpartyId}
            referenceType="offer"
            referenceId={offer.id}
            size="sm"
          />
        </div>
      </div>

      {/* Pre-action consequences (Wave 3 of the All-Aboard plan).
          When the user has clicked Accept or Accept-counter, we render
          what the action will do, with WhyLinks to the methodology pages,
          and a final Confirm step. Transparency Ring 2 extended forward
          in time — the Heptapod's primitive made literal on the highest-
          stakes irreversible action the storefront offers. */}
      {confirming && (
        <div className="mt-3 pt-3 border-t border-neutral-800 space-y-3">
          <Consequences items={consequencesFor(confirming)} />
          <div className="flex gap-2 justify-end">
            <button
              disabled={busy}
              onClick={() => setConfirming(null)}
              className="px-3 py-1.5 text-xs font-medium bg-neutral-800 text-neutral-300 rounded-md hover:bg-neutral-700 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              disabled={busy}
              onClick={() => {
                const path = confirming;
                setConfirming(null);
                onAct(path);
              }}
              className="px-3 py-1.5 text-xs font-bold bg-emerald-500 text-black rounded-md hover:bg-emerald-400 transition disabled:opacity-50"
            >
              {busy
                ? "..."
                : confirming === "accept-counter"
                  ? "Confirm — accept counter"
                  : "Confirm — accept offer"}
            </button>
          </div>
        </div>
      )}

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
