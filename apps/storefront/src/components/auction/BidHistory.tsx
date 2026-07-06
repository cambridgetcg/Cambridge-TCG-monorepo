import type { Bid } from "@/lib/auction/types";
import { MoneyDisplay, TrustTier } from "@/lib/ui";
import { anonId } from "@/lib/format";

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

interface BidHistoryProps {
  bids: Bid[];
  /**
   * Bidder trust tiers keyed by user_id, resolved server-side. When
   * present, a bid shows the bidder's tier chip — matching the anonymised
   * identity treatment of the public /auctions/[id]/read mirror. Optional
   * so the component degrades gracefully if the map isn't supplied.
   */
  trustTiers?: Record<string, { tier: string | null; score: number | null }>;
}

// Identity parity with /auctions/[id]/read: bidders are shown as opaque
// anonymised ids (last 6 chars of their uuid) + a trust tier chip, never a
// name. Correlation without disclosure — a reader can see "three bids from
// the same bidder" without learning who they are.
export default function BidHistory({ bids, trustTiers }: BidHistoryProps) {
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
      {sorted.map((bid) => {
        const anon = anonId(bid.user_id);
        const tierData = trustTiers?.[bid.user_id];
        return (
          <div key={bid.id} className="flex items-center justify-between py-3 px-1">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-surface-subtle flex items-center justify-center text-ink-faint text-[10px] font-mono font-bold shrink-0">
                {anon.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-ink-muted font-mono truncate flex items-center gap-2">
                  #{anon}
                  {bid.is_best_offer && (
                    <span className="text-xs text-accent font-sans">(offer)</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-ink-faint">{timeAgo(bid.created_at)}</p>
                  {tierData?.tier && (
                    <TrustTier name={tierData.tier} score={tierData.score} size="sm" />
                  )}
                </div>
              </div>
            </div>
            <MoneyDisplay value={parseFloat(bid.amount)} className="text-sm font-semibold text-bid shrink-0 ml-3" />
          </div>
        );
      })}
    </div>
  );
}
