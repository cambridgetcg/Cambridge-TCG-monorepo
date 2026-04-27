import type { Bid } from "@/lib/auction/types";
import { formatPrice } from "@/lib/format";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface BidHistoryProps {
  bids: Bid[];
}

export default function BidHistory({ bids }: BidHistoryProps) {
  if (bids.length === 0) {
    return (
      <div className="text-center py-8 text-neutral-500 text-sm">
        No bids yet
      </div>
    );
  }

  // Most recent first (should already be sorted, but ensure)
  const sorted = [...bids].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="max-h-80 overflow-y-auto space-y-0 divide-y divide-neutral-800">
      {sorted.map((bid) => (
        <div key={bid.id} className="flex items-center justify-between py-3 px-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-neutral-800 flex items-center justify-center text-neutral-500 text-xs font-bold shrink-0">
              {(bid.user_name || "A")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-white truncate">
                {bid.user_name || "Anonymous"}
                {bid.is_best_offer && (
                  <span className="ml-2 text-xs text-amber-400">(offer)</span>
                )}
              </p>
              <p className="text-xs text-neutral-500">{timeAgo(bid.created_at)}</p>
            </div>
          </div>
          <span className="text-sm font-semibold text-amber-500 shrink-0 ml-3">
            {formatPrice(parseFloat(bid.amount))}
          </span>
        </div>
      ))}
    </div>
  );
}
