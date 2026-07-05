import Link from "next/link";
import type { AuctionSummary } from "@/lib/auction/types";
import { MoneyDisplay } from "@/lib/ui";
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
      <div className="bg-surface rounded-lg overflow-hidden border border-border-subtle hover:border-border-strong transition">
        {/* Image */}
        <div className="aspect-[4/3] bg-surface-subtle relative overflow-hidden">
          {auction.image_url ? (
            <img
              src={auction.image_url}
              alt={auction.title}
              className="w-full h-full object-cover group-hover:scale-105 transition duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-faint">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
          <div className="absolute top-2 left-2 flex gap-1.5">
            <AuctionStatusBadge status={auction.status} />
            <span className="inline-block px-2 py-0.5 text-xs font-semibold rounded-full bg-black/60 text-white">
              {TYPE_LABELS[auction.auction_type] || auction.auction_type}
            </span>
          </div>
        </div>

        {/* Info */}
        <div className="p-4 space-y-2">
          <h3 className="text-sm font-semibold text-ink truncate group-hover:text-accent transition">
            {auction.title}
          </h3>

          <div className="flex items-center justify-between">
            <MoneyDisplay value={parseFloat(auction.current_price)} className="text-lg font-bold text-bid" />
            {auction.bid_count > 0 && (
              <span className="text-xs text-ink-faint">
                {auction.bid_count} bid{auction.bid_count !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {auction.status === "live" && (
            <div className="flex items-center gap-1.5 text-ink-muted">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <AuctionCountdown endsAt={auction.ends_at} serverTime={now} />
            </div>
          )}

          {auction.status === "scheduled" && (
            <p className="text-xs text-ink-faint">
              Starts {new Date(auction.starts_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      </div>
    </Link>
  );
}
