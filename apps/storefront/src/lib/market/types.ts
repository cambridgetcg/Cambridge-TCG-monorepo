export type OrderSide = "bid" | "ask";

// Buyer's shipping address as collected by Stripe Checkout at pay time
// (migration 0105 — global free trade). Flattened from Stripe's
// collected_information.shipping_details; every key optional because
// Stripe's per-country address formats vary. NULL/absent = trade predates
// the migration or hasn't been paid yet.
export interface TradeShippingAddress {
  name?: string;
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postal_code?: string;
  country?: string;
}

export type OrderStatus = "open" | "filled" | "partially_filled" | "cancelled" | "expired";
export type EscrowStatus =
  | "awaiting_payment" | "paid" | "awaiting_shipment" | "shipped_to_ctcg"
  | "received_by_ctcg" | "verified" | "shipped_to_buyer" | "completed"
  | "disputed" | "refunded" | "cancelled";

export interface MarketOrder {
  id: string;
  user_id: string;
  side: OrderSide;
  sku: string;
  card_name: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  condition: string;
  price: string;
  quantity: number;
  filled_quantity: number;
  status: OrderStatus;
  notes: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  user_name?: string | null;
}

/** Public lot facts. Seller account identifiers and profile data stay out. */
export interface PublicMarketLot {
  id: string;
  title: string;
  description: string | null;
  price: string;
  image_url: string | null;
  status: "active" | "sold" | "cancelled";
  created_at: string;
  updated_at: string;
  item_count?: number;
  total_quantity?: number;
  items?: Array<{
    sku: string;
    card_name: string | null;
    quantity: number;
  }>;
}

/**
 * A public ask is an offer to trade a card, not permission to publish a
 * seller dossier. Contact is a listing-scoped capability resolved by the
 * server from the listing id, never a reusable account id sent to the client.
 */
export interface PublicAskListing {
  id: string;
  price: string;
  remaining: number;
  condition: string;
  allow_offers: boolean;
  accepts_returns: boolean;
  return_window_days: number;
  created_at: string;
  is_own: boolean;
  seller: {
    contact_available: boolean;
  };
}

export interface MarketTrade {
  id: string;
  bid_order_id: string;
  ask_order_id: string;
  buyer_id: string;
  seller_id: string;
  sku: string;
  price: string;
  quantity: number;
  commission_rate: string;
  commission_amount: string;
  seller_payout: string;
  escrow_status: EscrowStatus;
  stripe_payment_intent: string | null;
  buyer_paid_at: string | null;
  seller_shipped_at: string | null;
  ctcg_received_at: string | null;
  ctcg_verified_at: string | null;
  shipped_to_buyer_at: string | null;
  completed_at: string | null;
  tracking_to_ctcg: string | null;
  tracking_to_buyer: string | null;
  dispute_reason: string | null;
  admin_notes: string | null;
  escrow_tier: "direct" | "verified" | "full_escrow" | null;
  requires_photos: boolean;
  requires_inspection: boolean;
  seller_ships_to: "buyer" | "ctcg" | null;
  dispute_window_hours: number | null;
  payout_hold_days: number | null;
  payment_expires_at: string | null;
  stripe_session_id: string | null;
  seller_paid_at: string | null;
  payout_method: string | null;
  payout_reference: string | null;
  shipping_address?: TradeShippingAddress | null;
  created_at: string;
  // Joined
  buyer_name?: string | null;
  buyer_email?: string;
  buyer_username?: string | null;
  seller_name?: string | null;
  seller_email?: string;
  seller_username?: string | null;
  card_name?: string | null;
  image_url?: string | null;
}

export interface OrderBookEntry {
  price: string;
  total_quantity: number;
  order_count: number;
}

export interface OrderBookSummary {
  sku: string;
  card_name: string | null;
  set_code: string | null;
  set_name: string | null;
  image_url: string | null;
  best_bid: string | null;
  best_ask: string | null;
  spread: number | null;
  bid_depth: number;
  ask_depth: number;
}

/** Deprecated compatibility shape. Public completed-trade rows are paused. */
export interface PublicTradeAggregate {
  period_start: string;
  trade_count: number;
  quantity: number;
  low_price: string;
  average_price: string;
  high_price: string;
}

export interface CardOrderBook {
  sku: string;
  card_name: string | null;
  image_url: string | null;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  /** Kept empty while completed-trade publication is paused. */
  trade_aggregates: PublicTradeAggregate[];
  trade_publication?: {
    status: "paused";
    reason: string;
    resumeConditions: readonly string[];
  };
  best_bid: string | null;
  best_ask: string | null;
}

// Cambridge TCG is free (2026-07-21) — no platform commission. Sellers keep
// 100% of every sale. These constants stay at 0 so any display/quote reads
// 0%; the charge itself is guaranteed 0 in computeCommissionAmount.
export const COMMISSION_RATE = 0;

// Trust-tier commission overrides — all 0 now (the market is free). Kept for
// shape; the trust tiers themselves remain as a reputation signal.
export const COMMISSION_RATE_BY_TIER: Record<string, number> = {
  New:     0,
  Starter: 0,
  Trusted: 0,
  Veteran: 0,
  Elite:   0,
};

// Resolve a seller's commission rate from their trust score.
export function commissionRateForScore(trustScore: number): number {
  // Inline thresholds mirror TRUST_TIERS.minScore; kept here to avoid a
  // market → escrow module dependency at data-layer time.
  if (trustScore >= 95) return COMMISSION_RATE_BY_TIER.Elite;
  if (trustScore >= 80) return COMMISSION_RATE_BY_TIER.Veteran;
  if (trustScore >= 50) return COMMISSION_RATE_BY_TIER.Trusted;
  if (trustScore >= 20) return COMMISSION_RATE_BY_TIER.Starter;
  return COMMISSION_RATE_BY_TIER.New;
}
