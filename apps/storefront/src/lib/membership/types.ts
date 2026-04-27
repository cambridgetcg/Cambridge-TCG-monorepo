export interface Tier {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sort_order: number;
  min_annual_spend: string;
  cashback_percent: string;
  points_multiplier: string;
  tradein_bonus_percent: string;
  p2p_commission_rate: string;
  auction_commission_rate: string;
  auction_priority_approval: boolean;
  store_discount_percent: string;
  is_paid: boolean;
  monthly_price: string | null;
  annual_price: string | null;
  benefits: string[];
  is_active: boolean;
  is_hidden: boolean;
}

export interface PointsEntry {
  id: string;
  user_id: string;
  amount: number;
  balance: number;
  type: string;
  description: string | null;
  reference_id: string | null;
  reference_type: string | null;
  expires_at: string | null;
  expired: boolean;
  created_at: string;
}

// Berries alias — prefer this in new code. The legacy `PointsEntry` name will
// remain until the DB column rename migration lands.
export type BerriesEntry = PointsEntry;

export interface CreditEntry {
  id: string;
  user_id: string;
  amount: string;
  balance: string;
  type: string;
  description: string | null;
  reference_id: string | null;
  created_at: string;
}

export interface MemberProfile {
  tier: Tier | null;
  next_tier: Tier | null;
  points_balance: number;
  lifetime_points: number;
  store_credit_balance: number;
  annual_spend: number;
  total_spend: number;
  progress_to_next: number; // 0-100
  amount_to_next: number;
  tier_source: string;
  perks: TierPerks;
}

export interface TierPerks {
  cashback_percent: number;
  points_multiplier: number;
  tradein_bonus_percent: number;
  p2p_commission_rate: number;
  auction_commission_rate: number;
  auction_priority_approval: boolean;
  store_discount_percent: number;
}

export const POINTS_TYPES = {
  ORDER_EARNED: "order_earned",
  TRADEIN_EARNED: "tradein_earned",
  MANUAL_CREDIT: "manual_credit",
  MANUAL_DEBIT: "manual_debit",
  REDEEMED: "redeemed",
  EXPIRED: "expired",
  MIGRATION: "migration",
} as const;

export const CREDIT_TYPES = {
  CASHBACK: "cashback",
  TRADEIN_CREDIT: "tradein_credit",
  MANUAL_ADJUSTMENT: "manual_adjustment",
  REDEEMED_AT_CHECKOUT: "redeemed_checkout",
  MIGRATION: "migration",
} as const;

export const DEFAULT_PERKS: TierPerks = {
  cashback_percent: 0,
  points_multiplier: 1,
  tradein_bonus_percent: 0,
  p2p_commission_rate: 0.08,
  auction_commission_rate: 0.12,
  auction_priority_approval: false,
  store_discount_percent: 0,
};
