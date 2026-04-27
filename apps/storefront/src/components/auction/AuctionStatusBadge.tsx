import type { AuctionStatus } from "@/lib/auction/types";

const STATUS_STYLES: Record<AuctionStatus, string> = {
  draft: "bg-neutral-700 text-neutral-300",
  scheduled: "bg-blue-900/60 text-blue-300",
  live: "bg-emerald-900/60 text-emerald-300",
  ended: "bg-neutral-700 text-neutral-400",
  paid: "bg-emerald-900/60 text-emerald-300",
  cancelled: "bg-red-900/60 text-red-300",
};

const STATUS_LABELS: Record<AuctionStatus, string> = {
  draft: "Draft",
  scheduled: "Upcoming",
  live: "Live",
  ended: "Ended",
  paid: "Paid",
  cancelled: "Cancelled",
};

export default function AuctionStatusBadge({ status }: { status: AuctionStatus }) {
  return (
    <span
      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_STYLES[status] || "bg-neutral-700 text-neutral-400"}`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}
