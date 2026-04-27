import Link from "next/link";
import type { AuctionSummary } from "@/lib/auction/types";
import { formatPrice } from "@/lib/format";
import AuctionStatusBadge from "./AuctionStatusBadge";
import AuctionCountdown from "./AuctionCountdown";

interface AuctionCardProps {
  auction: AuctionSummary;
  serverTime?: string;
}

const TYPE_LABELS: Record<string, string> = {
  english: "English",
  dutch: "Dutch",
  buy_now: "Buy Now",
};

export default function AuctionCard({ auction, serverTime }: AuctionCardProps) {
  const now = serverTime || new Date().toISOString();

  return (
    <Link href={`/auctions/${auction.id}`} className="block group">
      <div className="bg-neutral-900 rounded-xl overflow-hidden border border-neutral-800 hover:border-neutral-700 transition">
        {/* Image */}
        <div className="aspect-[4/3] bg-neutral-800 relative overflow-hidden">
          {auction.image_url ? (
            <img
              src={auction.image_url}
              alt={auction.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-neutral-600">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1.5">
            <AuctionStatusBadge status={auction.status} />
            <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-900/60 text-amber-300">
              {TYPE_LABELS[auction.auction_type] || auction.auction_type}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 space-y-2">
          <h3 className="text-sm font-semibold text-white truncate group-hover:text-amber-400 transition">
            {auction.title}
          </h3>

          <div className="flex items-center justify-between">
            <span className="text-lg font-bold text-amber-500">
              {formatPrice(parseFloat(auction.current_price))}
            </span>
            {auction.bid_count > 0 && (
              <span className="text-xs text-neutral-500">
                {auction.bid_count} bid{auction.bid_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {auction.status === "live" && (
            <div className="flex items-center gap-1.5 text-neutral-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <AuctionCountdown endsAt={auction.ends_at} serverTime={now} />
            </div>
          )}

          {auction.status === "scheduled" && (
            <p className="text-xs text-neutral-500">
              Starts {new Date(auction.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
