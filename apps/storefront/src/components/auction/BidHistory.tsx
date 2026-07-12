import type { PublicAuctionBid } from "@/lib/auction/public";
import { MoneyDisplay } from "@/lib/ui";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

type PublicBidEvent = Pick<PublicAuctionBid, "amount" | "status" | "created_at">;

export default function BidHistory({ bids }: { bids: PublicBidEvent[] }) {
  if (bids.length === 0) {
    return <div className="py-8 text-center text-sm text-ink-faint">No public bids yet</div>;
  }

  const sorted = [...bids].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  return (
    <div className="max-h-80 divide-y divide-border-subtle overflow-y-auto">
      {sorted.map((bid, index) => (
        <div
          key={`${bid.created_at}:${bid.amount}:${index}`}
          className="flex items-center justify-between gap-3 px-1 py-3"
        >
          <div>
            <p className="text-xs text-ink-faint">{timeAgo(bid.created_at)}</p>
            <p className="text-[11px] capitalize text-ink-faint">{bid.status}</p>
          </div>
          <MoneyDisplay
            value={parseFloat(bid.amount)}
            className="shrink-0 text-sm font-semibold text-bid"
          />
        </div>
      ))}
    </div>
  );
}
