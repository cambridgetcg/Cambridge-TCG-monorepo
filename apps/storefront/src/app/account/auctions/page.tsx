"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/format";

interface SellerAuction {
  id: string;
  title: string;
  auction_type: string;
  status: string;
  approval_status: "pending_review" | "approved" | "rejected" | null;
  approval_notes: string | null;
  current_price: string;
  starting_price: string;
  buy_now_price: string | null;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  created_at: string;
  image_url: string | null;
}

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-neutral-700 text-neutral-300",
  scheduled: "bg-blue-500/20 text-blue-400",
  live: "bg-emerald-500/20 text-emerald-400",
  ended: "bg-neutral-600/20 text-neutral-400",
  paid: "bg-emerald-500/20 text-emerald-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const APPROVAL_BADGE: Record<string, { className: string; label: string }> = {
  pending_review: { className: "bg-amber-500/20 text-amber-400", label: "Pending Review" },
  approved: { className: "bg-emerald-500/20 text-emerald-400", label: "Approved" },
  rejected: { className: "bg-red-500/20 text-red-400", label: "Rejected" },
};

interface Offer {
  bid_id: string;
  auction_id: string;
  auction_title: string;
  amount: string;
  buy_now_price: string | null;
  bidder_name: string | null;
  bidder_email: string;
  created_at: string;
}

export default function MyAuctionsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<SellerAuction[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actingOfferId, setActingOfferId] = useState<string | null>(null);

  async function loadOffers() {
    const r = await fetch("/api/auctions/my/offers");
    if (!r.ok) return;
    const d = await r.json();
    setOffers(d.offers || []);
  }

  async function loadAuctions() {
    const r = await fetch("/api/auctions/my");
    if (!r.ok) return;
    const d = await r.json();
    setAuctions(d.auctions || []);
  }

  async function actOnOffer(offer: Offer, action: "accept" | "reject") {
    const label = action === "accept"
      ? `Accept ${formatPrice(parseFloat(offer.amount))} offer from ${offer.bidder_name || offer.bidder_email}? The auction will end immediately.`
      : `Reject this offer?`;
    if (!confirm(label)) return;

    setActingOfferId(offer.bid_id);
    try {
      const res = await fetch(`/api/auctions/${offer.auction_id}/offers/${offer.bid_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || `Failed to ${action} offer`);
        return;
      }
      await Promise.all([loadOffers(), loadAuctions()]);
    } finally {
      setActingOfferId(null);
    }
  }

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((data) => {
        if (!data?.user?.email) {
          router.push("/login");
          return;
        }

        Promise.all([loadAuctions(), loadOffers()]).finally(() => setLoading(false));
      });
  }, [router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">My Auctions</h1>
        <Link
          href="/auctions/sell"
          className="px-4 py-2 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
        >
          Sell a Card
        </Link>
      </div>

      {offers.length > 0 && (
        <div className="bg-neutral-900 rounded-xl p-4 mb-6 border border-amber-500/20">
          <h2 className="text-sm font-bold text-white mb-3">
            Open Offers ({offers.length})
          </h2>
          <div className="space-y-2">
            {offers.map((offer) => (
              <div
                key={offer.bid_id}
                className="flex flex-wrap items-center gap-3 p-3 bg-neutral-950 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-white truncate">
                      {offer.auction_title}
                    </span>
                    {offer.buy_now_price && (
                      <span className="text-xs text-neutral-500">
                        (Buy Now {formatPrice(parseFloat(offer.buy_now_price))})
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-neutral-500 mt-0.5">
                    {offer.bidder_name || offer.bidder_email} — {new Date(offer.created_at).toLocaleString("en-GB")}
                  </div>
                </div>
                <div className="text-lg font-bold text-amber-400">
                  {formatPrice(parseFloat(offer.amount))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => actOnOffer(offer, "accept")}
                    disabled={actingOfferId === offer.bid_id}
                    className="px-3 py-1.5 bg-emerald-500 text-black text-xs font-bold rounded-lg hover:bg-emerald-400 transition disabled:opacity-50"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => actOnOffer(offer, "reject")}
                    disabled={actingOfferId === offer.bid_id}
                    className="px-3 py-1.5 bg-neutral-800 text-neutral-300 text-xs font-bold rounded-lg hover:bg-neutral-700 transition disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {auctions.length === 0 ? (
        <div className="bg-neutral-900 rounded-xl p-8 text-center">
          <div className="text-neutral-600 mb-3">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-neutral-400">No auctions yet</h2>
          <p className="text-neutral-500 text-sm mt-1 mb-4">
            List your first card and start selling.
          </p>
          <Link
            href="/auctions/sell"
            className="inline-block px-5 py-2.5 bg-amber-500 text-black text-sm font-bold rounded-lg hover:bg-amber-400 transition"
          >
            Sell at Auction
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {auctions.map((auction) => {
            const expanded = expandedId === auction.id;
            const approvalInfo = auction.approval_status
              ? APPROVAL_BADGE[auction.approval_status]
              : null;

            return (
              <div key={auction.id} className="bg-neutral-900 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpandedId(expanded ? null : auction.id)}
                  className="w-full p-4 text-left hover:bg-neutral-800/50 transition"
                >
                  <div className="flex items-start gap-4">
                    {/* Thumbnail */}
                    {auction.image_url ? (
                      <img
                        src={auction.image_url}
                        alt=""
                        className="w-14 h-14 rounded-lg object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-lg bg-neutral-800 shrink-0 flex items-center justify-center">
                        <span className="text-neutral-600 text-xs">No img</span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-bold text-white truncate">{auction.title}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[auction.status] || STATUS_BADGE.draft}`}>
                          {auction.status}
                        </span>
                        {approvalInfo && (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${approvalInfo.className}`}>
                            {approvalInfo.label}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <span>{formatPrice(parseFloat(auction.current_price))}</span>
                        <span>{auction.bid_count} bid{auction.bid_count !== 1 ? "s" : ""}</span>
                        <span>{new Date(auction.created_at).toLocaleDateString("en-GB")}</span>
                      </div>
                    </div>

                    <span className={`text-neutral-500 transition ${expanded ? "rotate-180" : ""}`}>
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </span>
                  </div>
                </button>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-neutral-800 pt-3 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-neutral-500">Type</span>
                        <p className="text-white capitalize">{auction.auction_type.replace("_", " ")}</p>
                      </div>
                      <div>
                        <span className="text-neutral-500">Starting Price</span>
                        <p className="text-white">{formatPrice(parseFloat(auction.starting_price))}</p>
                      </div>
                      {auction.buy_now_price && (
                        <div>
                          <span className="text-neutral-500">Buy Now Price</span>
                          <p className="text-white">{formatPrice(parseFloat(auction.buy_now_price))}</p>
                        </div>
                      )}
                      <div>
                        <span className="text-neutral-500">Ends</span>
                        <p className="text-white">{new Date(auction.ends_at).toLocaleString("en-GB")}</p>
                      </div>
                    </div>

                    {auction.approval_status === "rejected" && auction.approval_notes && (
                      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
                        <p className="text-xs text-red-400 font-medium mb-1">Rejection Reason</p>
                        <p className="text-sm text-red-300">{auction.approval_notes}</p>
                      </div>
                    )}

                    {auction.status === "live" && (
                      <Link
                        href={`/auctions/${auction.id}`}
                        className="inline-block text-sm text-amber-400 hover:text-amber-300 transition font-medium"
                      >
                        View live auction &rarr;
                      </Link>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
