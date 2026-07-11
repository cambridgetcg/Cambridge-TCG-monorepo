"use client";

// The interactive half of /auctions/[id]. The page.tsx server shell
// resolves the auction, card identity and the viewer's
// session, then seeds this island so the FIRST paint (SSR + hydration)
// already carries the card, price and bids — no empty client shell, and a
// real <title>/OG for shared links and crawlers. This island keeps the
// live 10s poll and the bidding / post-win interactions.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  hasParticipantAuctionDetail,
  type InteractiveAuctionDetail,
} from "@/lib/auction/public";
import { isReserveMet } from "@/lib/auction/lifecycle";
import AuctionImageGallery from "@/components/auction/AuctionImageGallery";
import BidPanel from "@/components/auction/BidPanel";
import BidHistory from "@/components/auction/BidHistory";
import AuctionStatusBadge from "@/components/auction/AuctionStatusBadge";
import PostWinPanel from "@/components/auction/PostWinPanel";

const TYPE_LABELS: Record<string, string> = {
  english: "English Auction",
  dutch: "Dutch Auction",
  buy_now: "Buy Now",
};

export interface AuctionCardIdentity {
  sku: string;
  card_name: string;
  card_number: string;
  set_name: string | null;
  set_code: string;
}

interface Props {
  initialAuction: InteractiveAuctionDetail & { id: string };
  initialSessionUserId: string | null;
  /** Resolved from auctions.sku via the catalogue, when the auction carries one. */
  cardIdentity: AuctionCardIdentity | null;
}

export default function AuctionDetailClient({
  initialAuction,
  initialSessionUserId,
  cardIdentity,
}: Props) {
  const [auction, setAuction] = useState<InteractiveAuctionDetail & { id: string }>(initialAuction);
  const [sessionUserId, setSessionUserId] = useState<string | null>(initialSessionUserId);
  const id = initialAuction.id;

  // Reconcile the session client-side: the server prop can go stale after a
  // bfcache restore or a sign-in that happened in another tab.
  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => setSessionUserId(data?.user?.id ?? null))
      .catch(() => {
        /* keep the server-seeded value */
      });
  }, []);

  // Poll for updates every 10 seconds on live auctions.
  useEffect(() => {
    if (auction.status !== "live") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auctions/${id}`);
        if (res.ok) {
          const data: InteractiveAuctionDetail = await res.json();
          setAuction({ ...data, id });
        }
      } catch {
        // Silently fail on poll
      }
    }, 10_000);
    return () => clearInterval(interval);
  }, [id, auction.status]);

  const reserveStatus = "reserve_met" in auction
    ? auction.reserve_met
    : isReserveMet(auction);
  const canSeePrivateOffers =
    auction.viewer_role === "seller" || auction.viewer_role === "admin";
  const visibleBids = auction.bids
    .filter((bid) => canSeePrivateOffers || !bid.is_best_offer)
    .map((bid) => ({
      amount: bid.amount,
      is_best_offer: bid.is_best_offer,
      status: bid.status,
      created_at: bid.created_at,
      is_own: "is_own" in bid ? bid.is_own : false,
    }));

  return (
    <div className="min-h-screen bg-page">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-ink-faint mb-6">
          <a href="/auctions" className="hover:text-ink transition">Auctions</a>
          <span>/</span>
          <span className="text-ink-muted truncate">{auction.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left column: images + description + bid history */}
          <div className="lg:col-span-3 space-y-6">
            <AuctionImageGallery images={auction.images} />

            {/* Title & meta */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <AuctionStatusBadge status={auction.status} />
                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-accent-wash text-accent-strong">
                  {TYPE_LABELS[auction.auction_type] || auction.auction_type}
                </span>
                {reserveStatus !== null && (
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                    reserveStatus
                      ? "bg-ok/15 text-ok"
                      : "bg-accent-wash text-accent-strong"
                  }`}>
                    {reserveStatus ? "Reserve met" : "Reserve not yet met"}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-display font-semibold text-ink">{auction.title}</h1>
              {/* Card-identity link — ends the auction island: the auction's
                  own card page on the market. */}
              {cardIdentity && (
                <Link
                  href={`/market/${cardIdentity.sku}`}
                  className="inline-flex items-center gap-1.5 mt-2 text-sm text-accent hover:text-accent-strong transition"
                >
                  <span className="font-mono text-ink-muted">{cardIdentity.card_number}</span>
                  {cardIdentity.set_name && <span className="text-ink-faint">· {cardIdentity.set_name}</span>}
                  <span>— view on the market →</span>
                </Link>
              )}
            </div>

            {/* Description */}
            {auction.description && (
              <div className="bg-surface rounded-lg border border-border-subtle p-5">
                <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-3">
                  Description
                </h2>
                <div className="text-ink-muted text-sm leading-relaxed whitespace-pre-wrap">
                  {auction.description}
                </div>
              </div>
            )}

            {/* Bid History */}
            <div className="bg-surface rounded-lg border border-border-subtle p-5">
              <h2 className="text-sm font-semibold text-ink-muted uppercase tracking-wider mb-3 flex items-center gap-1.5">
                Bid History
              </h2>
              <p className="text-[11px] text-ink-faint mb-3">
                Price, status and time only. Bidder identity and trust are withheld;
                private best offers are visible only to the seller and admins.
              </p>
              <BidHistory bids={visibleBids} />
            </div>
          </div>

          {/* Right column: sticky bid panel + post-win flow */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-4">
              <BidPanel auction={auction} sessionUserId={sessionUserId} />
              {hasParticipantAuctionDetail(auction) &&
                (auction.status === "ended" || auction.status === "paid") && (
                <PostWinPanel
                  auction={auction}
                  viewerRole={auction.viewer_role}
                  onRefresh={async () => {
                    const res = await fetch(`/api/auctions/${id}`);
                    if (res.ok) {
                      const data: InteractiveAuctionDetail = await res.json();
                      setAuction({ ...data, id });
                    }
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
