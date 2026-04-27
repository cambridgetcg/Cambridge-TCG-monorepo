export type OrderSide = "bid" | "ask";
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
  created_at: string;
  // Joined
  buyer_name?: string | null;
  buyer_email?: string;
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
  last_trade_price: string | null;
  trade_count_24h: number;
}

export interface CardOrderBook {
  sku: string;
  card_name: string | null;
  image_url: string | null;
  bids: OrderBookEntry[];
  asks: OrderBookEntry[];
  recent_trades: MarketTrade[];
  best_bid: string | null;
  best_ask: string | null;
}

// Base commission rate — used as the default and as the ceiling for every
// tier below. Tiered rates reward high-trust sellers and are resolved at
// match time from the seller's current trust score.
export const COMMISSION_RATE = 0.08; // 8% — "New" / "Starter" tiers

// Trust-tier commission overrides. Keyed by the tier name in TRUST_TIERS
// (src/lib/escrow/types). Missing tiers fall back to COMMISSION_RATE.
// Rates compound the reputation flywheel: higher trust = more retained
// earnings = stickier sellers.
export const COMMISSION_RATE_BY_TIER: Record<string, number> = {
  New:     0.08,
  Starter: 0.08,
  Trusted: 0.07,  // 1% off
  Veteran: 0.06,  // 2% off
  Elite:   0.05,  // 3% off — meaningful on high-volume inventory
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
