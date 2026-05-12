/**
 * Named status palettes — one per consumer-side domain.
 *
 * Each palette maps a domain's status enum to a Tone from <Badge>. The
 * mapping is the contract: when a status appears in code (e.g. an
 * EscrowStatus union from @/lib/market/types), the palette shows what
 * colour that status renders as on the consumer surface. Pages import a
 * palette + the labels (when display strings differ from raw enum values)
 * and pass them to <Badge>. No page should hand-roll a STATUS_* map.
 *
 * Subsumes 13 inline maps that previously lived in /account/* and
 * /prices/* page files.
 */

import type { Tone } from "./Badge";

// ── orders (storefront customer_orders) ─────────────────────────────
export const OrderStatusPalette: Record<string, Tone> = {
  completed: "emerald",
  shipped: "blue",
  partially_shipped: "blue",
  processing: "amber",
  redemption_pending: "amber",
  refunded: "red",
  cancelled: "neutral",
};

export const OrderStatusLabels: Record<string, string> = {
  completed: "Delivered",
  shipped: "Shipped",
  partially_shipped: "Partially shipped",
  processing: "Processing",
  redemption_pending: "Awaiting shipment",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

// ── escrow (market_trades lifecycle) ────────────────────────────────
export const EscrowStatusPalette: Record<string, Tone> = {
  awaiting_payment: "amber",
  paid: "blue",
  awaiting_shipment: "blue",
  shipped_to_ctcg: "blue",
  received_by_ctcg: "purple",
  verified: "emerald",
  shipped_to_buyer: "emerald",
  completed: "green",
  disputed: "red",
  refunded: "red",
  cancelled: "neutral",
};

export const EscrowStatusLabels: Record<string, string> = {
  awaiting_payment: "Awaiting Payment",
  paid: "Paid",
  awaiting_shipment: "Awaiting Shipment",
  shipped_to_ctcg: "Shipped to CTCG",
  received_by_ctcg: "Received by CTCG",
  verified: "Verified",
  shipped_to_buyer: "Shipped to Buyer",
  completed: "Completed",
  disputed: "Disputed",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

// ── auctions ─────────────────────────────────────────────────────────
export const AuctionStatusPalette: Record<string, Tone> = {
  draft: "neutral",
  scheduled: "blue",
  live: "emerald",
  ended: "amber",
  paid: "emerald",
  cancelled: "red",
};

export const AuctionStatusLabels: Record<string, string> = {
  draft: "Draft",
  scheduled: "Upcoming",
  live: "Live",
  ended: "Ended",
  paid: "Paid",
  cancelled: "Cancelled",
};

export const AuctionApprovalPalette: Record<string, Tone> = {
  pending: "amber",
  approved: "emerald",
  rejected: "red",
  changes_requested: "amber",
};

// ── trade-ins ────────────────────────────────────────────────────────
export const TradeInStatusPalette: Record<string, Tone> = {
  draft: "neutral",
  submitted: "amber",
  quoted: "blue",
  received: "blue",
  grading: "purple",
  approved: "emerald",
  paid: "green",
  rejected: "red",
  cancelled: "neutral",
  expired: "neutral",
};

// ── offers ───────────────────────────────────────────────────────────
export const OfferStatusPalette: Record<string, Tone> = {
  pending: "amber",
  accepted: "emerald",
  declined: "red",
  countered: "blue",
  expired: "neutral",
  withdrawn: "neutral",
};

// ── returns ──────────────────────────────────────────────────────────
export const ReturnStatusPalette: Record<string, Tone> = {
  requested: "amber",
  accepted:  "blue",
  shipping:  "blue",
  received:  "purple",
  refunded:  "emerald",
  declined:  "neutral",
  cancelled: "neutral",
  expired:   "neutral",
};

// ── chargebacks (customer view — what the platform tells the user) ──
export const ChargebackStatusPalette: Record<string, Tone> = {
  needs_response: "red",
  under_review: "amber",
  warning_closed: "amber",
  warning_needs_response: "amber",
  won: "emerald",
  lost: "red",
  charge_refunded: "neutral",
  admin_resolved: "neutral",
};

// ── refunds ──────────────────────────────────────────────────────────
export const RefundStatusPalette: Record<string, Tone> = {
  pending: "amber",
  succeeded: "emerald",
  failed: "red",
  cancelled: "neutral",
};

// ── vacation (seller vacations) ─────────────────────────────────────
//
// "ended" reads as a *positive* outcome here — the seller completed
// their vacation cleanly — so it gets emerald, not neutral. Contrast
// with AuctionStatusPalette where "ended" is amber (the auction expired
// without resolution).
export const VacationStatusPalette: Record<string, Tone> = {
  scheduled: "blue",
  active:    "amber",
  ended:     "emerald",
  cancelled: "neutral",
};

// ── pricing rules ────────────────────────────────────────────────────
export const PricingRuleStatusPalette: Record<string, Tone> = {
  active:   "emerald",
  paused:   "neutral",
  archived: "neutral",
  expired:  "neutral",
};

// ── trade cancels ────────────────────────────────────────────────────
export const CancelStatusPalette: Record<string, Tone> = {
  requested: "amber",
  approved:  "emerald",
  declined:  "neutral",
  expired:   "neutral",
  withdrawn: "neutral",
};

// ── saved searches (alert on a query) ───────────────────────────────
//
// "expired" reads as amber here (the user may want to extend), in
// contrast with PricingRuleStatusPalette where "expired" is neutral
// (functionally archived).
export const SavedSearchStatusPalette: Record<string, Tone> = {
  active:   "emerald",
  paused:   "neutral",
  expired:  "amber",
  archived: "neutral",
};

// ── vault (bounty pull holdings) ────────────────────────────────────
export const VaultStatusPalette: Record<string, Tone> = {
  reserved:  "amber",
  redeemed:  "emerald",
  sold_back: "sky",
  expired:   "neutral",
  gifted:    "purple",
  traded:    "purple",
};

// ── standing severity (account/standing flags) ──────────────────────
export const StandingSeverityPalette: Record<string, Tone> = {
  critical: "red",
  high: "amber",
  medium: "sky",
  low: "neutral",
};

// ── trust tier (5 tiers from @/lib/escrow/types TRUST_TIERS) ────────
export const TrustTierPalette: Record<string, Tone> = {
  Elite: "purple",
  Veteran: "amber",
  Trusted: "emerald",
  Starter: "sky",
  New: "neutral",
};

// ── card rarity (catalog/buylist) ───────────────────────────────────
export const RarityPalette: Record<string, Tone> = {
  C: "neutral",
  UC: "blue",
  R: "amber",
  SR: "purple",
  SEC: "red",
  L: "amber",
  P: "neutral",
  SP: "purple",
};

// ── mystery-box rarity (rewards) ────────────────────────────────────
//
// Distinct from card rarity above — mystery-box rarities use a
// common/uncommon/rare/legendary scale which doesn't map cleanly to
// card-rarity codes. Both palettes co-exist; pick the one matching
// the surface's domain.
export const MysteryBoxRarityPalette: Record<string, Tone> = {
  common:    "neutral",
  uncommon:  "blue",
  rare:      "purple",
  legendary: "amber",
};

// ── trade-in quote (reference-flow status) ──────────────────────────
export const QuoteStatusPalette: Record<string, Tone> = {
  pending:   "amber",
  quoted:    "blue",
  accepted:  "emerald",
  declined:  "red",
  expired:   "neutral",
  cancelled: "neutral",
};
