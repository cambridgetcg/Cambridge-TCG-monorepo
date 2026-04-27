// Auction post-win fulfilment timeline. Splits by is_consignment:
// consigned auctions go through CTCG (seller → CTCG → buyer), direct
// sales skip that middle leg. Same per-status step-index map pattern
// as @/lib/escrow/timeline + @/lib/trust/dispute-timeline so new
// states can't silently regress the customer-visible step position.
//
// escrow_status values used (set by the lifecycle APIs in this arc):
//
//   awaiting_payment  — buyer owes money (auction.status='ended')
//   awaiting_shipment — seller ships (auction.status='paid')
//   received_by_ctcg  — consigned only, CTCG is inspecting
//   shipped_to_buyer  — in transit to buyer
//   completed         — buyer confirmed (or auto-confirm window passed)
//   cancelled         — edge case: refunded / withdrawn

import type { Auction } from "./types";

export interface TimelineStep {
  key: string;
  label: string;
  /** Column on the auctions row whose non-null timestamp lights this step. */
  tsField: keyof Auction;
}

export const CONSIGNED_TIMELINE: TimelineStep[] = [
  { key: "won",                label: "Won",                  tsField: "actual_end_at" },
  { key: "paid",               label: "Paid",                 tsField: "paid_at" },
  { key: "seller_shipped",     label: "Seller Shipped",       tsField: "seller_shipped_at" },
  { key: "received_by_ctcg",   label: "CTCG Received",        tsField: "received_by_ctcg_at" },
  { key: "shipped_to_buyer",   label: "Shipped to You",       tsField: "shipped_to_buyer_at" },
  { key: "buyer_received",     label: "Delivered",            tsField: "buyer_received_at" },
];

export const DIRECT_TIMELINE: TimelineStep[] = [
  { key: "won",                label: "Won",                  tsField: "actual_end_at" },
  { key: "paid",               label: "Paid",                 tsField: "paid_at" },
  { key: "seller_shipped",     label: "Shipped",              tsField: "seller_shipped_at" },
  { key: "buyer_received",     label: "Delivered",            tsField: "buyer_received_at" },
];

export function getTimelineSteps(auction: Pick<Auction, "is_consignment">): TimelineStep[] {
  return auction.is_consignment ? CONSIGNED_TIMELINE : DIRECT_TIMELINE;
}

// Map escrow_status → step index per flavour. Unknown / terminal
// failure states (cancelled / refunded) stay at 0 to avoid claiming
// progress they haven't made.
const CONSIGNED_STATUS_STEP: Record<string, number> = {
  awaiting_payment:   1,
  awaiting_shipment:  2,
  received_by_ctcg:   3,
  shipped_to_buyer:   4,
  completed:          5,
};

const DIRECT_STATUS_STEP: Record<string, number> = {
  awaiting_payment:   1,
  awaiting_shipment:  2,
  shipped_to_buyer:   2,  // direct auctions: "shipped" = step 2, not a separate CTCG step
  completed:          3,
};

export function getFulfilmentStep(auction: Pick<Auction, "is_consignment" | "escrow_status" | "status">): number {
  // Before ended, step 0 (Won hasn't happened yet).
  if (auction.status !== "ended" && auction.status !== "paid") return 0;
  // Ended but no escrow_status → buyer owes money, step 1 (Paid is next).
  // Actually on 'ended' nothing's happened yet past "Won". Paid step
  // lights only when paid_at is set.
  if (auction.status === "ended") return 0;

  const map = auction.is_consignment ? CONSIGNED_STATUS_STEP : DIRECT_STATUS_STEP;
  const step = auction.escrow_status ? map[auction.escrow_status] : 0;
  return step ?? 0;
}

export function isFulfilmentTerminal(auction: Pick<Auction, "escrow_status" | "status">): boolean {
  return (
    auction.escrow_status === "completed" ||
    auction.escrow_status === "cancelled" ||
    auction.status === "cancelled"
  );
}

// Which party's turn it is to act. Used by the UI to highlight the
// exact CTA (Pay / Ship / Mark received). Returns null when the
// waiting party is CTCG / no user action needed.
export type ActorRole = "buyer" | "seller" | "ctcg" | null;

export function getCurrentActor(auction: Pick<Auction, "is_consignment" | "escrow_status" | "status">): ActorRole {
  if (auction.status === "ended" && (!auction.escrow_status || auction.escrow_status === "awaiting_payment")) {
    return "buyer";
  }
  if (auction.status !== "paid") return null;
  switch (auction.escrow_status) {
    case "awaiting_shipment":
      return "seller";
    case "received_by_ctcg":
      return "ctcg";
    case "shipped_to_buyer":
      return "buyer"; // mark received
    default:
      return null;
  }
}
