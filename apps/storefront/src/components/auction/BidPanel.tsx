"use client";

import { useEffect, useState, useCallback } from "react";
import type { InteractiveAuctionDetail } from "@/lib/auction/public";
import { formatPrice } from "@/lib/format";
import AuctionCountdown from "./AuctionCountdown";

interface BidPanelProps {
  auction: InteractiveAuctionDetail & { id: string };
  sessionUserId?: string | null;
}

function currentDutchPrice(auction: InteractiveAuctionDetail): number {
  if (auction.auction_type !== "dutch") return parseFloat(auction.current_price);
  const startPrice = parseFloat(auction.dutch_start_price || auction.starting_price);
  const endPrice = parseFloat(auction.dutch_end_price || "0");
  const drop = parseFloat(auction.dutch_price_drop || "0");
  const interval = auction.dutch_drop_interval_seconds || 60;
  const elapsed = (Date.now() - new Date(auction.starts_at).getTime()) / 1000;
  return Math.max(startPrice - Math.floor(elapsed / interval) * drop, endPrice);
}

function minNextBid(auction: InteractiveAuctionDetail): number {
  const current = parseFloat(auction.current_price);
  const increment = parseFloat(auction.bid_increment);
  const starting = parseFloat(auction.starting_price);
  return auction.bid_count > 0 ? current + increment : starting;
}

function reserveMet(auction: InteractiveAuctionDetail): boolean | null {
  if ("reserve_met" in auction) return auction.reserve_met;
  if (!auction.reserve_price) return null;
  return parseFloat(auction.current_price) >= parseFloat(auction.reserve_price);
}

export default function BidPanel({ auction, sessionUserId }: BidPanelProps) {
  const [bidAmount, setBidAmount] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dutchPrice, setDutchPrice] = useState(() => currentDutchPrice(auction));

  const isEnded = auction.status === "ended" || auction.status === "paid" || auction.status === "cancelled";
  const isLive = auction.status === "live";
  const reserveStatus = reserveMet(auction);

  // Update dutch price every second
  useEffect(() => {
    if (auction.auction_type !== "dutch" || !isLive) return;
    const interval = setInterval(() => {
      setDutchPrice(currentDutchPrice(auction));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction, isLive]);

  // Set default bid amount
  useEffect(() => {
    if (auction.auction_type === "english") {
      setBidAmount(minNextBid(auction).toFixed(2));
    }
  }, [auction]);

  // Check if current user is highest bidder
  const highestBid = auction.bids.length > 0 ? auction.bids[0] : null;
  const isOwnBid = (bid: (typeof auction.bids)[number]): boolean =>
    "is_own" in bid && bid.is_own === true;
  const isHighestBidder = Boolean(sessionUserId && highestBid && isOwnBid(highestBid));
  const isOutbid = Boolean(
    sessionUserId &&
    highestBid &&
    !isOwnBid(highestBid) &&
    auction.bids.some(isOwnBid),
  );

  const submitBid = useCallback(async (amount: number, isBestOffer = false) => {
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/auctions/${auction.id}/bids`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount, is_best_offer: isBestOffer }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to place bid");
      } else {
        setSuccess(isBestOffer ? "Offer submitted!" : "Bid placed!");
        setBidAmount("");
        setOfferAmount("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [auction.id]);

  return (
    <div className="bg-surface rounded-lg border border-border-subtle p-6 space-y-5">
      {/* Countdown */}
      {isLive && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-faint uppercase tracking-wider">Time Remaining</span>
          <AuctionCountdown endsAt={auction.ends_at} serverTime={auction.server_time} />
        </div>
      )}

      {isEnded && (
        <div className="text-center py-2">
          <span className="text-ink-faint font-semibold">Auction Ended</span>
        </div>
      )}

      {/* Reserve indicator */}
      {reserveStatus !== null && isLive && (
        <div className={`text-xs font-medium px-3 py-1.5 rounded-lg text-center ${
          reserveStatus
            ? "bg-ok/10 text-ok"
            : "bg-warning/10 text-warning"
        }`}>
          {reserveStatus ? "Reserve met" : "Reserve not yet met"}
        </div>
      )}

      {/* English Auction */}
      {auction.auction_type === "english" && (
        <div className="space-y-4">
          <div>
            <span className="text-xs text-ink-faint uppercase tracking-wider">Current Price</span>
            <p className="text-3xl font-bold text-bid mt-1">
              {formatPrice(parseFloat(auction.current_price))}
            </p>
            {auction.bid_count > 0 && (
              <p className="text-xs text-ink-faint mt-1">
                {auction.bid_count} bid{auction.bid_count !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {isHighestBidder && (
            <div className="bg-bid/10 text-bid text-sm font-medium px-3 py-2 rounded-lg text-center">
              You are the highest bidder
            </div>
          )}

          {isOutbid && (
            <div className="bg-ask/10 text-ask text-sm font-medium px-3 py-2 rounded-lg text-center">
              You have been outbid
            </div>
          )}

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-surface-subtle text-ink-muted rounded-lg hover:text-ink transition font-medium"
                >
                  Sign in to bid
                </a>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-ink-faint mb-1 block">
                      Min bid: {formatPrice(minNextBid(auction))}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min={minNextBid(auction)}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition"
                          placeholder={minNextBid(auction).toFixed(2)}
                          disabled={submitting}
                        />
                      </div>
                      <button
                        onClick={() => submitBid(parseFloat(bidAmount))}
                        disabled={submitting || !bidAmount}
                        className="px-6 py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        {submitting ? "Placing..." : "Place Bid"}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Dutch Auction */}
      {auction.auction_type === "dutch" && (
        <div className="space-y-4">
          <div>
            <span className="text-xs text-ink-faint uppercase tracking-wider">Current Price</span>
            <p className="text-3xl font-bold text-ask mt-1">
              {formatPrice(dutchPrice)}
            </p>
            <p className="text-xs text-ink-muted mt-1">Price drops over time</p>
          </div>

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-surface-subtle text-ink-muted rounded-lg hover:text-ink transition font-medium"
                >
                  Sign in to bid
                </a>
              ) : (
                <button
                  onClick={() => submitBid(dutchPrice)}
                  disabled={submitting}
                  className="w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {submitting ? "Processing..." : `Buy at ${formatPrice(dutchPrice)}`}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* Buy Now */}
      {auction.auction_type === "buy_now" && (
        <div className="space-y-4">
          <div>
            <span className="text-xs text-ink-faint uppercase tracking-wider">Price</span>
            <p className="text-3xl font-bold text-ask mt-1">
              {formatPrice(parseFloat(auction.buy_now_price || auction.current_price))}
            </p>
          </div>

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-surface-subtle text-ink-muted rounded-lg hover:text-ink transition font-medium"
                >
                  Sign in to buy
                </a>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => submitBid(parseFloat(auction.buy_now_price || auction.current_price))}
                    disabled={submitting}
                    className="w-full py-3 bg-ink text-page font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                  >
                    {submitting ? "Processing..." : "Buy Now"}
                  </button>

                  {auction.allow_best_offer && (
                    <div>
                      <label className="text-xs text-ink-faint mb-1 block">Or make an offer</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint">£</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={offerAmount}
                            onChange={(e) => setOfferAmount(e.target.value)}
                            className="w-full pl-7 pr-3 py-3 bg-surface border border-border-subtle rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-accent/50 transition"
                            placeholder="Your offer"
                            disabled={submitting}
                          />
                        </div>
                        <button
                          onClick={() => submitBid(parseFloat(offerAmount), true)}
                          disabled={submitting || !offerAmount}
                          className="px-6 py-3 bg-surface-subtle text-ink font-semibold rounded-lg hover:bg-surface-elevated transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {submitting ? "Sending..." : "Make Offer"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Error / Success messages */}
      {error && (
        <div className="bg-danger/10 text-danger text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-ok/10 text-ok text-sm px-3 py-2 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );
}
