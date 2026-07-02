import type { Bid } from "@/lib/auction/types";
import { MoneyDisplay } from "@/lib/ui";

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
      <div className="text-center py-8 text-ink-faint text-sm">
        No bids yet
      </div>
    );
  }

  // Most recent first (should already be sorted, but ensure)
  const sorted = [...bids].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return (
    <div className="max-h-80 overflow-y-auto space-y-0 divide-y divide-border-subtle">
      {sorted.map((bid) => (
        <div key={bid.id} className="flex items-center justify-between py-3 px-1">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-full bg-surface-elevated flex items-center justify-center text-ink-faint text-xs font-bold shrink-0">
              {(bid.user_name || "A")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm text-ink truncate">
                {bid.user_name || "Anonymous"}
                {bid.is_best_offer && (
                  <span className="ml-2 text-xs text-accent-strong">(offer)</span>
                )}
              </p>
              <p className="text-xs text-ink-faint">{timeAgo(bid.created_at)}</p>
            </div>
          </div>
          <MoneyDisplay value={parseFloat(bid.amount)} className="text-sm font-semibold text-accent shrink-0 ml-3" />
        </div>
      ))}
    </div>
  );
}
