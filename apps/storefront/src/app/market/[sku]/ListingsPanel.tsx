"use client";

// Per-listing view of the open asks on one card, with the offer composer.
// The order book (unified view) aggregates by price and drops order ids;
// negotiation needs the individual ask — its id (the makeOffer target),
// remaining quantity, the seller behind it, and its return terms.

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Icon, MessageButton, Money, TrustTier, WhyLink } from "@/lib/ui";
import { formatPrice, formatDateTime } from "@/lib/format";
import {
  pickOfferAnchor,
  pctDelta,
  describeDelta,
  tradeLimitWarning,
  type FairValueInput,
} from "./offer-guidance";

export interface TrustLimits {
  tradeLimit: number | null;
  dailyLimit: number | null;
  warnings: string[];
}

interface AskListing {
  id: string;
  price: string;
  remaining: number;
  condition: string;
  allow_offers: boolean;
  accepts_returns: boolean;
  return_window_days: number;
  created_at: string;
  seller: {
    username: string | null;
    trust_score: number | null;
    tier: string | null;
    review_count: number;
    avg_rating: number | null;
  };
}

// <Provenance> is a server-only async component (it reads the lang-mode
// cookie); this whole tree is client-rendered, so this mirrors its visual
// language for the one label the composer needs. The claim it carries:
// which SOURCE a reference price came from.
function SourceLabel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span
      className="inline-block text-[10px] uppercase tracking-wider text-ink-faint"
      title={title}
    >
      {children}
    </span>
  );
}

export function ListingsPanel({
  sku,
  loggedIn,
  bestBid,
  fairValue,
  spotPrice,
  limits,
  onBuy,
}: {
  sku: string;
  loggedIn: boolean | null;
  bestBid: number | null;
  fairValue: FairValueInput | null;
  spotPrice: number | null;
  limits: TrustLimits | null;
  // Prefills the card's buy form with this ask's terms and scrolls to it
  // (P1a) — the row Buy affordance the panel advertises now actually acts.
  onBuy?: (opts: { price: number; quantity?: number; condition?: "NM" | "LP" | "MP" | "HP" }) => void;
}) {
  const [asks, setAsks] = useState<AskListing[] | null>(null);
  const [openComposer, setOpenComposer] = useState<string | null>(null);

  const fetchAsks = useCallback(() => {
    fetch(`/api/market/offers/asks?sku=${encodeURIComponent(sku)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setAsks(d.asks || []); })
      .catch(() => setAsks([]));
  }, [sku]);

  useEffect(() => { fetchAsks(); }, [fetchAsks]);

  if (!asks || asks.length === 0) return null;

  return (
    <div className="wardrobe-mat rounded-lg p-4">
      <h2 className="text-sm font-bold font-display tracking-tight text-ink mb-1">
        Open Asks — Negotiate or Message
      </h2>
      <p className="text-xs text-ink-faint mb-3">
        Each row is one seller&rsquo;s listing. Make an offer below the ask, or message the
        seller before you trade.
      </p>
      <div className="space-y-2">
        {asks.map((ask) => (
          <div key={ask.id} className="border border-border-subtle rounded-lg p-3">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-mono tabular-nums font-bold text-ask">
                <Money value={parseFloat(ask.price)} />
              </span>
              <span className="text-xs text-ink-muted font-mono tabular-nums">
                ×{ask.remaining}
              </span>
              <span className="text-xs text-ink-faint">{ask.condition}</span>
              {ask.accepts_returns && (
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-ok/10 text-ok border border-ok/30"
                  title={`Seller accepts no-fault returns for ${ask.return_window_days} days after the trade completes. Refunds are admin-mediated.`}
                >
                  returns · <span className="font-mono tabular-nums">{ask.return_window_days}d</span>
                </span>
              )}
              <span className="flex items-center gap-1.5 text-xs min-w-0">
                {ask.seller.username ? (
                  <Link href={`/u/${ask.seller.username}`} className="text-accent hover:underline">
                    @{ask.seller.username}
                  </Link>
                ) : (
                  <span className="text-ink-faint">seller</span>
                )}
                {ask.seller.tier && (
                  <TrustTier name={ask.seller.tier} score={null} showScore={false} />
                )}
                {ask.seller.username && (
                  <Link
                    href={`/u/${ask.seller.username}/trust`}
                    className="text-ink-faint hover:text-accent hover:underline"
                  >
                    <span className="font-mono tabular-nums">{ask.seller.review_count}</span>{" "}
                    review{ask.seller.review_count !== 1 ? "s" : ""}
                  </Link>
                )}
              </span>
              <span className="ml-auto flex items-center gap-2">
                {loggedIn && (
                  <MessageButton
                    referenceType="market_order"
                    referenceId={ask.id}
                    label="Message"
                    size="sm"
                  />
                )}
                {onBuy && (
                  <button
                    type="button"
                    onClick={() =>
                      onBuy({
                        price: parseFloat(ask.price),
                        quantity: 1,
                        condition: (["NM", "LP", "MP", "HP"].includes(ask.condition)
                          ? ask.condition
                          : "NM") as "NM" | "LP" | "MP" | "HP",
                      })
                    }
                    className="min-h-[44px] sm:min-h-0 px-3 py-1.5 text-xs font-bold rounded-md bg-bid text-page hover:opacity-90 transition"
                    title={`Prefill the buy form at ${formatPrice(parseFloat(ask.price))}`}
                  >
                    Buy
                  </button>
                )}
                {ask.allow_offers ? (
                  <button
                    onClick={() => setOpenComposer(openComposer === ask.id ? null : ask.id)}
                    className="px-3 py-1.5 text-xs font-bold rounded-md bg-accent text-page hover:bg-accent-strong transition"
                  >
                    {openComposer === ask.id ? "Close" : "Make offer"}
                  </button>
                ) : (
                  <span className="text-[10px] text-ink-faint" title="The seller turned offers off on this listing — Buy Now only.">
                    no offers
                  </span>
                )}
              </span>
            </div>
            {openComposer === ask.id && ask.allow_offers && (
              <OfferComposer
                sku={sku}
                ask={ask}
                bestBid={bestBid}
                fairValue={fairValue}
                spotPrice={spotPrice}
                loggedIn={loggedIn}
                limits={limits}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function OfferComposer({
  sku,
  ask,
  bestBid,
  fairValue,
  spotPrice,
  loggedIn,
  limits,
}: {
  sku: string;
  ask: AskListing;
  bestBid: number | null;
  fairValue: FairValueInput | null;
  spotPrice: number | null;
  loggedIn: boolean | null;
  limits: TrustLimits | null;
}) {
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ expiresAt: string } | null>(null);

  const askPrice = parseFloat(ask.price);
  const parsedPrice = parseFloat(price);
  const parsedQty = Math.max(1, parseInt(quantity, 10) || 1);
  const priceValid = Number.isFinite(parsedPrice) && parsedPrice > 0;
  const offerValue = priceValid ? parsedPrice * parsedQty : 0;

  const anchor = pickOfferAnchor(fairValue, spotPrice);
  const deltaAsk = priceValid ? describeDelta(pctDelta(parsedPrice, askPrice)) : null;
  const deltaAnchor = priceValid && anchor ? describeDelta(pctDelta(parsedPrice, anchor.value)) : null;
  const limitWarning = tradeLimitWarning(offerValue, limits);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/market/offers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          askOrderId: ask.id,
          offerPrice: parsedPrice,
          quantity: parsedQty,
          message: message.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send the offer.");
        return;
      }
      setSent({ expiresAt: data.offer?.expires_at });
    } catch {
      setError("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <div className="bg-ok/10 border border-ok/30 rounded-lg p-3 text-sm text-ok">
          <p className="font-semibold">
            Offer sent{ask.seller.username ? ` to @${ask.seller.username}` : ""}.
          </p>
          <p className="text-xs text-ink-muted mt-1">
            The seller can accept, counter, or decline
            {sent.expiresAt
              ? <> before <span className="font-mono tabular-nums">{formatDateTime(sent.expiresAt)}</span></>
              : " within their response window"}
            . Responses land in{" "}
            <Link href="/account/offers" className="text-accent hover:underline">
              your offers inbox
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  if (loggedIn === false) {
    return (
      <div className="mt-3 pt-3 border-t border-border-subtle">
        <ComposerGuidance
          askPrice={askPrice} bestBid={bestBid} anchor={anchor}
          deltaAsk={null} deltaAnchor={null}
        />
        <div className="mt-2 text-center py-3 bg-surface-subtle rounded-lg">
          <p className="text-xs text-ink-muted mb-1">Sign in to make an offer on this ask.</p>
          <Link
            href={`/login?return=${encodeURIComponent(`/market/${sku}`)}`}
            className="text-accent hover:underline text-sm font-medium"
          >
            Sign in — you&rsquo;ll come back here
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-3 pt-3 border-t border-border-subtle space-y-3">
      <ComposerGuidance
        askPrice={askPrice} bestBid={bestBid} anchor={anchor}
        deltaAsk={deltaAsk} deltaAnchor={deltaAnchor}
      />

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[130px]">
          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-faint text-xs">£</span>
          <input
            type="number"
            step="0.01"
            min="0.01"
            max={askPrice}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            placeholder={`up to ${formatPrice(askPrice)}`}
            aria-label="Offer price (GBP)"
            className="w-full pl-6 pr-2 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono tabular-nums focus:outline-none focus:border-accent transition"
          />
        </div>
        {ask.remaining > 1 && (
          <input
            type="number"
            min="1"
            max={ask.remaining}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            aria-label={`Quantity (up to ${ask.remaining})`}
            title={`Quantity (up to ${ask.remaining})`}
            className="w-20 px-2 py-2 bg-surface-elevated border border-border-strong rounded-lg text-ink text-sm font-mono tabular-nums focus:outline-none focus:border-accent transition"
          />
        )}
      </div>

      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Optional message to the seller"
        className="w-full px-2 py-1.5 bg-surface-elevated border border-border-strong rounded-lg text-ink text-xs resize-none focus:outline-none focus:border-accent transition"
      />

      {limitWarning && (
        <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          {limitWarning}
          <WhyLink href="/methodology/trust-score" tooltip="How trading limits are set" />
        </p>
      )}
      {!limitWarning && limits && limits.warnings.length > 0 && (
        <p className="text-[11px] text-accent">{limits.warnings[0]}</p>
      )}

      <p className="text-[11px] text-ink-faint leading-relaxed">
        You pay the agreed price if the seller accepts; the seller pays commission at their
        resolved rate (5&ndash;8%, capped at &pound;50)
        <WhyLink href="/methodology/offers" tooltip="How offers and their fees work" />
        . Offers expire within the seller&rsquo;s response window (48h default).
      </p>

      {error && (
        <p className="text-xs text-danger bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitting || loggedIn === null || !priceValid || parsedPrice > askPrice || !!limitWarning}
        className="w-full py-2 rounded-lg font-bold text-sm bg-accent text-page hover:bg-accent-strong transition disabled:opacity-50"
      >
        {submitting
          ? "Sending..."
          : priceValid
            ? <>Offer <span className="font-mono tabular-nums">{formatPrice(offerValue)}</span>{parsedQty > 1 ? ` for ${parsedQty}` : ""}</>
            : "Send offer"}
      </button>
    </form>
  );
}

// The pricing anchors, honestly sourced: the card's own 30-day tape when
// it exists; the CTCG catalogue spot as a labelled reference when the
// tape is cold (different source, different meaning — our retail price,
// not a P2P clearing price).
function ComposerGuidance({
  askPrice,
  bestBid,
  anchor,
  deltaAsk,
  deltaAnchor,
}: {
  askPrice: number;
  bestBid: number | null;
  anchor: ReturnType<typeof pickOfferAnchor>;
  deltaAsk: string | null;
  deltaAnchor: string | null;
}) {
  return (
    <div className="bg-surface-subtle rounded-lg p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">Ask</span>
        <span className="font-mono tabular-nums text-ask font-semibold"><Money value={askPrice} /></span>
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-ink-muted">Best bid</span>
        <span className="font-mono tabular-nums text-bid">
          {bestBid !== null ? <Money value={bestBid} /> : "—"}
        </span>
      </div>
      {anchor && anchor.kind === "own-tape" && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-muted">
            Fair value (30d){" "}
            <SourceLabel title="Computed from this card's own completed trades on this market over the last 30 days.">
              computed · own trades · {anchor.basis}
            </SourceLabel>
          </span>
          <span className="font-mono tabular-nums text-ink"><Money value={anchor.value} /></span>
        </div>
      )}
      {anchor && anchor.kind === "ctcg-spot" && (
        <div className="flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-muted">
            CTCG spot{" "}
            <SourceLabel title="No P2P trades on this card yet, so there is no own-tape fair value. This is Cambridge TCG's own catalogue price — a different source: our retail price, not what peers paid each other.">
              reference · ctcg catalogue, no p2p tape
            </SourceLabel>
          </span>
          <span className="font-mono tabular-nums text-accent"><Money value={anchor.value} /></span>
        </div>
      )}
      {(deltaAsk || deltaAnchor) && (
        <p className="text-[11px] text-ink-muted pt-1 border-t border-border-subtle flex items-center gap-1">
          <Icon name="info" size={11} className="shrink-0 text-ink-faint" />
          <span>
            Your offer is {deltaAsk && <>{deltaAsk} the ask</>}
            {deltaAsk && deltaAnchor && " · "}
            {deltaAnchor && anchor && (
              <>{deltaAnchor} {anchor.kind === "own-tape" ? "fair value" : "CTCG spot"}</>
            )}
            .
          </span>
        </p>
      )}
    </div>
  );
}
