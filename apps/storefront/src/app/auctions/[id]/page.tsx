"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { AuctionDetail } from "@/lib/auction/types";
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

export default function AuctionDetailPage() {
  const params = useParams();
  const id = params.id as string;

  const [auction, setAuction] = useState<AuctionDetail | null>(null);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [auctionRes, sessionRes] = await Promise.all([
          fetch(`/api/auctions/${id}`),
          fetch("/api/auth/session"),
        ]);

        if (!auctionRes.ok) {
          setError("Auction not found");
          return;
        }

        const auctionData: AuctionDetail = await auctionRes.json();
        setAuction(auctionData);

        try {
          const sessionData = await sessionRes.json();
          setSessionUserId(sessionData?.user?.id || null);
        } catch {
          // Not logged in
        }
      } catch {
        setError("Failed to load auction");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  // Poll for updates every 10 seconds on live auctions
  useEffect(() => {
    if (!auction || auction.status !== "live") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auctions/${id}`);
        if (res.ok) {
          const data: AuctionDetail = await res.json();
          setAuction(data);
        }
      } catch {
        // Silently fail on poll
      }
    }, 10_000);

    return () => clearInterval(interval);
  }, [id, auction?.status]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950">
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
            <div className="lg:col-span-3 space-y-6">
              <div className="aspect-square bg-neutral-900 rounded-xl animate-pulse" />
              <div className="h-8 bg-neutral-900 rounded w-3/4 animate-pulse" />
              <div className="h-32 bg-neutral-900 rounded animate-pulse" />
            </div>
            <div className="lg:col-span-2">
              <div className="h-80 bg-neutral-900 rounded-xl animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !auction) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">
            {error || "Auction not found"}
          </h1>
          <a href="/auctions" className="text-amber-500 hover:text-amber-400 transition text-sm">
            Back to auctions
          </a>
        </div>
      </div>
    );
  }

  const reserveStatus = isReserveMet(auction);

  return (
    <div className="min-h-screen bg-neutral-950">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-neutral-500 mb-6">
          <a href="/auctions" className="hover:text-white transition">Auctions</a>
          <span>/</span>
          <span className="text-neutral-300 truncate">{auction.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left column: images + description + bid history */}
          <div className="lg:col-span-3 space-y-6">
            <AuctionImageGallery images={auction.images} />

            {/* Title & meta */}
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <AuctionStatusBadge status={auction.status} />
                <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-900/60 text-amber-300">
                  {TYPE_LABELS[auction.auction_type] || auction.auction_type}
                </span>
                {reserveStatus !== null && (
                  <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${
                    reserveStatus
                      ? "bg-emerald-900/60 text-emerald-300"
                      : "bg-amber-900/60 text-amber-300"
                  }`}>
                    {reserveStatus ? "Reserve met" : "Reserve not yet met"}
                  </span>
                )}
              </div>
              <h1 className="text-2xl font-bold text-white">{auction.title}</h1>
            </div>

            {/* Description */}
            {auction.description && (
              <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5">
                <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                  Description
                </h2>
                <div className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
                  {auction.description}
                </div>
              </div>
            )}

            {/* Bid History */}
            <div className="bg-neutral-900 rounded-xl border border-neutral-800 p-5">
              <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-wider mb-3">
                Bid History
              </h2>
              <BidHistory bids={auction.bids} />
            </div>
          </div>

          {/* Right column: sticky bid panel + post-win flow */}
          <div className="lg:col-span-2">
            <div className="lg:sticky lg:top-24 space-y-4">
              <BidPanel auction={auction} sessionUserId={sessionUserId} />
              {(auction.status === "ended" || auction.status === "paid") && (
                <PostWinPanel
                  auction={auction}
                  sessionUserId={sessionUserId}
                  onRefresh={async () => {
                    const res = await fetch(`/api/auctions/${id}`);
                    if (res.ok) setAuction(await res.json());
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
