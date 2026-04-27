"use client";

import { useEffect, useState, useCallback } from "react";
import type { AuctionDetail } from "@/lib/auction/types";
import { getCurrentDutchPrice, getMinNextBid, isReserveMet } from "@/lib/auction/lifecycle";
import { formatPrice } from "@/lib/format";
import AuctionCountdown from "./AuctionCountdown";

interface BidPanelProps {
  auction: AuctionDetail;
  sessionUserId?: string | null;
}

export default function BidPanel({ auction, sessionUserId }: BidPanelProps) {
  const [bidAmount, setBidAmount] = useState("");
  const [offerAmount, setOfferAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [dutchPrice, setDutchPrice] = useState(() => getCurrentDutchPrice(auction));

  const isEnded = auction.status === "ended" || auction.status === "paid" || auction.status === "cancelled";
  const isLive = auction.status === "live";
  const reserveStatus = isReserveMet(auction);

  // Update dutch price every second
  useEffect(() => {
    if (auction.auction_type !== "dutch" || !isLive) return;
    const interval = setInterval(() => {
      setDutchPrice(getCurrentDutchPrice(auction));
    }, 1000);
    return () => clearInterval(interval);
  }, [auction, isLive]);

  // Set default bid amount
  useEffect(() => {
    if (auction.auction_type === "english") {
      setBidAmount(getMinNextBid(auction).toFixed(2));
    }
  }, [auction]);

  // Check if current user is highest bidder
  const highestBid = auction.bids.length > 0 ? auction.bids[0] : null;
  const isHighestBidder = sessionUserId && highestBid && highestBid.user_id === sessionUserId;
  const isOutbid = sessionUserId && highestBid && highestBid.user_id !== sessionUserId &&
    auction.bids.some((b) => b.user_id === sessionUserId);

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
    <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-6 space-y-5">
      {/* Countdown */}
      {isLive && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-500 uppercase tracking-wider">Time Remaining</span>
          <AuctionCountdown endsAt={auction.ends_at} serverTime={auction.server_time} />
        </div>
      )}

      {isEnded && (
        <div className="text-center py-2">
          <span className="text-neutral-500 font-semibold">Auction Ended</span>
        </div>
      )}

      {/* Reserve indicator */}
      {reserveStatus !== null && isLive && (
        <div className={`text-xs font-medium px-3 py-1.5 rounded-lg text-center ${
          reserveStatus
            ? "bg-emerald-900/40 text-emerald-400"
            : "bg-amber-900/40 text-amber-400"
        }`}>
          {reserveStatus ? "Reserve met" : "Reserve not yet met"}
        </div>
      )}

      {/* English Auction */}
      {auction.auction_type === "english" && (
        <div className="space-y-4">
          <div>
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Current Price</span>
            <p className="text-3xl font-bold text-amber-500 mt-1">
              {formatPrice(parseFloat(auction.current_price))}
            </p>
            {auction.bid_count > 0 && (
              <p className="text-xs text-neutral-500 mt-1">
                {auction.bid_count} bid{auction.bid_count !== 1 ? "s" : ""}
              </p>
            )}
          </div>

          {isHighestBidder && (
            <div className="bg-emerald-900/30 text-emerald-400 text-sm font-medium px-3 py-2 rounded-lg text-center">
              You are the highest bidder
            </div>
          )}

          {isOutbid && (
            <div className="bg-red-900/30 text-red-400 text-sm font-medium px-3 py-2 rounded-lg text-center">
              You have been outbid
            </div>
          )}

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition font-medium"
                >
                  Sign in to bid
                </a>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-neutral-500 mb-1 block">
                      Min bid: {formatPrice(getMinNextBid(auction))}
                    </label>
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min={getMinNextBid(auction)}
                          value={bidAmount}
                          onChange={(e) => setBidAmount(e.target.value)}
                          className="w-full pl-7 pr-3 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 transition"
                          placeholder={getMinNextBid(auction).toFixed(2)}
                          disabled={submitting}
                        />
                      </div>
                      <button
                        onClick={() => submitBid(parseFloat(bidAmount))}
                        disabled={submitting || !bidAmount}
                        className="px-6 py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Current Price</span>
            <p className="text-3xl font-bold text-amber-500 mt-1">
              {formatPrice(dutchPrice)}
            </p>
            <p className="text-xs text-neutral-400 mt-1">Price drops over time</p>
          </div>

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition font-medium"
                >
                  Sign in to bid
                </a>
              ) : (
                <button
                  onClick={() => submitBid(dutchPrice)}
                  disabled={submitting}
                  className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
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
            <span className="text-xs text-neutral-500 uppercase tracking-wider">Price</span>
            <p className="text-3xl font-bold text-amber-500 mt-1">
              {formatPrice(parseFloat(auction.buy_now_price || auction.current_price))}
            </p>
          </div>

          {isLive && !isEnded && (
            <>
              {!sessionUserId ? (
                <a
                  href="/login"
                  className="block w-full text-center py-3 bg-neutral-800 text-neutral-300 rounded-lg hover:bg-neutral-700 transition font-medium"
                >
                  Sign in to buy
                </a>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => submitBid(parseFloat(auction.buy_now_price || auction.current_price))}
                    disabled={submitting}
                    className="w-full py-3 bg-amber-500 text-black font-bold rounded-lg hover:bg-amber-400 transition disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                  >
                    {submitting ? "Processing..." : "Buy Now"}
                  </button>

                  {auction.allow_best_offer && (
                    <div>
                      <label className="text-xs text-neutral-500 mb-1 block">Or make an offer</label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">£</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            value={offerAmount}
                            onChange={(e) => setOfferAmount(e.target.value)}
                            className="w-full pl-7 pr-3 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-white focus:outline-none focus:border-amber-500 transition"
                            placeholder="Your offer"
                            disabled={submitting}
                          />
                        </div>
                        <button
                          onClick={() => submitBid(parseFloat(offerAmount), true)}
                          disabled={submitting || !offerAmount}
                          className="px-6 py-3 bg-neutral-700 text-white font-bold rounded-lg hover:bg-neutral-600 transition disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
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
        <div className="bg-red-900/30 text-red-400 text-sm px-3 py-2 rounded-lg">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-emerald-900/30 text-emerald-400 text-sm px-3 py-2 rounded-lg">
          {success}
        </div>
      )}
    </div>
  );
}
