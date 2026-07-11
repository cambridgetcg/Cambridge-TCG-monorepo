import { computeCommissionAmount } from "@cambridge-tcg/pricing";
import type { TradeShippingAddress } from "@/lib/market/types";

export type AuctionType = "english" | "dutch" | "buy_now";
export type AuctionStatus = "draft" | "scheduled" | "live" | "ended" | "paid" | "cancelled";
export type BidStatus = "active" | "outbid" | "winning" | "rejected";

// The winner's shipping address is the SAME jsonb shape the market
// collects at pay time (migration 0105 / 0114). Reuse the market type so
// the flatten block and the seller-paid email render identically across
// both settlement engines rather than forking a parallel definition.
export type AuctionShippingAddress = TradeShippingAddress;

// Card conditions accepted on an auction listing. Auctions allow DMG
// (damaged) in addition to the market order set (NM/LP/MP/HP) because a
// graded/played single is a legitimate thing to auction as-is.
export const AUCTION_CONDITIONS = ["NM", "LP", "MP", "HP", "DMG"] as const;
export type AuctionCondition = (typeof AUCTION_CONDITIONS)[number];

export function isAuctionCondition(v: unknown): v is AuctionCondition {
  return typeof v === "string" && (AUCTION_CONDITIONS as readonly string[]).includes(v);
}

export interface Auction {
  id: string;
  title: string;
  description: string | null;
  // Card identity (migration 0113). Nullable — pre-identity demo rows and
  // legacy title-only auctions carry null. `sku` is the canonical catalog
  // SKU (resolved server-side from card_set_cards, never client-trusted);
  // `condition` is one of AUCTION_CONDITIONS.
  sku: string | null;
  condition: string | null;
  auction_type: AuctionType;
  status: AuctionStatus;
  starting_price: string;
  reserve_price: string | null;
  buy_now_price: string | null;
  bid_increment: string;
  dutch_start_price: string | null;
  dutch_end_price: string | null;
  dutch_price_drop: string | null;
  dutch_drop_interval_seconds: number | null;
  starts_at: string;
  ends_at: string;
  actual_end_at: string | null;
  current_price: string;
  bid_count: number;
  winner_user_id: string | null;
  stripe_session_id: string | null;
  stripe_payment_intent: string | null;
  paid_at: string | null;
  payment_expires_at: string | null;
  allow_best_offer: boolean;
  // Customer-created auction fields
  seller_user_id: string | null;
  is_consignment: boolean;
  approval_status: "pending_review" | "approved" | "rejected" | null;
  approval_notes: string | null;
  seller_commission_rate: string;
  seller_payout: string | null;
  seller_paid_at: string | null;
  escrow_status: string | null;
  tracking_to_ctcg: string | null;
  tracking_to_buyer: string | null;
  // Fulfilment-chain timestamps (migration 0058). Power the customer
  // timeline + seller/buyer shipping UI. Auction.escrow_status remains
  // the current sub-state label during the physical handoff.
  seller_shipped_at: string | null;
  received_by_ctcg_at: string | null;
  shipped_to_buyer_at: string | null;
  buyer_received_at: string | null;
  carrier_to_ctcg: string | null;
  carrier_to_buyer: string | null;
  // Winner's shipping address, collected by Stripe Checkout at pay time
  // (migration 0114). NULL until the winner pays. Participant-only: the
  // viewer projections expose it only to the winner and to a direct seller
  // who needs the delivery address.
  shipping_address: AuctionShippingAddress | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionImage {
  id: string;
  auction_id: string;
  url: string;
  s3_key: string;
  display_order: number;
  created_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  user_id: string;
  amount: string;
  is_best_offer: boolean;
  status: string;
  created_at: string;
  // Joined fields
  user_name?: string | null;
  user_email?: string;
}

export interface AuctionDetail extends Auction {
  images: AuctionImage[];
  bids: Bid[];
  computed_price?: number; // For Dutch auctions
  server_time: string;
}

export interface AuctionSummary {
  id: string;
  title: string;
  sku?: string | null;
  condition?: string | null;
  auction_type: AuctionType;
  status: AuctionStatus;
  current_price: string;
  starting_price: string;
  buy_now_price: string | null;
  bid_count: number;
  starts_at: string;
  ends_at: string;
  image_url: string | null;
}

export interface CreateAuctionInput {
  title: string;
  description?: string;
  // Card identity — resolved to a canonical catalog SKU + a valid
  // AuctionCondition by the route handler before it reaches the DB.
  sku?: string;
  condition?: string;
  auction_type: AuctionType;
  starting_price: number;
  reserve_price?: number;
  buy_now_price?: number;
  bid_increment?: number;
  dutch_start_price?: number;
  dutch_end_price?: number;
  dutch_price_drop?: number;
  dutch_drop_interval_seconds?: number;
  starts_at: string;
  ends_at: string;
  allow_best_offer?: boolean;
  seller_user_id?: string;
  seller_commission_rate?: number;
}

export type ApprovalStatus = "pending_review" | "approved" | "rejected";

export const SELLER_COMMISSION_RATE = 0.12; // 12% default

export interface BidResult {
  success: boolean;
  bid?: Bid;
  error?: string;
  auction?: Auction;
}

// ── Pure settlement predicates (no DB — unit-testable) ──
// These live here (types.ts imports no @/lib/db) so the settlement tests
// exercise the REAL code path placeBid / calculateSellerPayout use,
// instead of a copy that could drift.

/**
 * Shill-bid guard. True when the bidder is the auction's own seller — a
 * self-bid drives the price undetectably in a trust-language market and
 * must be refused on BOTH the regular-bid and best-offer paths. Mirrors
 * the market's self-match exclusion (o.user_id != taker in market/db.ts).
 */
export function isSelfBid(
  sellerUserId: string | null | undefined,
  bidderUserId: string,
): boolean {
  return !!sellerUserId && sellerUserId === bidderUserId;
}

/**
 * Map a trust-engine `canTrade` result to a BidResult error, or null when
 * the gate allows the action. Used by placeBid for BOTH regular bids and
 * best offers so an over-cap user can't dodge the cap via an offer.
 */
export function trustGateToBidResult(
  gate: { allowed: boolean; reason?: string | null },
): BidResult | null {
  if (gate.allowed) return null;
  return { success: false, error: gate.reason ?? "Order rejected by trust gate." };
}

/**
 * Pure seller-payout math at settlement. Extracted verbatim from
 * calculateSellerPayout so it can be asserted without a DB round-trip —
 * the money math itself is unchanged (錢就再講): commission comes from
 * @cambridge-tcg/pricing's per-item-capped computeCommissionAmount, and
 * the effective rate is the tier floor min(stored, current-tier).
 *
 * `salePrice` at settlement is the FINAL winning price (auctions.current_
 * price after the auction ends), NOT the starting price the admin-approve
 * path used to read.
 */
export function resolveAuctionPayout(input: {
  salePrice: number;
  storedRate: number;
  tierRate: number | null;
}): { rate: number; commission: number; payout: number } {
  const { salePrice, storedRate, tierRate } = input;
  // Stored rate is the floor; a tier upgrade between listing and payout
  // retroactively lowers it. Downgrades never raise it.
  const rate = tierRate !== null && tierRate < storedRate ? tierRate : storedRate;
  const commission = computeCommissionAmount(salePrice, rate).amount;
  const payout = salePrice - commission;
  return { rate, commission, payout };
}
