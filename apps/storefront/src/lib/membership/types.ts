/**
 * Membership module — front door / map.
 *
 * This file is the natural index for the membership domain. Whoever lands
 * here from a `import { ... } from "@/lib/membership/types"` should see
 * the whole shape of the system before opening any other file.
 *
 * ── The story this module tells ──────────────────────────────────────────
 *
 * Every Cambridge TCG user has a tier. A tier is a bundle of economic
 * promises — cashback %, points multiplier, trade-in bonus, P2P commission,
 * auction commission, store discount — that get applied at every cash-money
 * moment. A tier is not cosmetic. It is the multiplier the platform
 * applies to the user's transactions.
 *
 * Three sources can name a tier (priority order, see db.ts → recalculateTier):
 *   0. MANUAL  — admin-granted, never overridden (OG members, concessions).
 *   1. PAID    — Platinum subscription, active per Stripe.
 *   2. SPEND   — annual_spend qualifies for a free-tier rung.
 *
 * The user can move along this ladder via three gestures:
 *   - Subscribe   POST /api/membership/subscribe   →  paid floor on
 *   - Cancel      POST /api/membership/cancel      →  paid floor scheduled off
 *   - Resume      POST /api/membership/resume      →  paid cancel undone
 *
 * Plus the implicit gesture: every paid order grows annual_spend, which
 * may automatically promote them up the SPEND rungs over time.
 *
 * ── Files in this module, by what they carry ─────────────────────────────
 *
 *   types.ts                    you are here. Shapes + module map.
 *   db.ts                       tier priority chain + ledgers (points,
 *                               credit) + processOrderRewards (the
 *                               post-checkout-reward funnel).
 *   subscription.ts             Stripe lifecycle helpers (cancel, resume,
 *                               portal). Stripe is authoritative; we mirror.
 *   commission.ts               where tier × trust_score = the rate we
 *                               charge sellers. The two reward systems meet.
 *   subscription-sweep.ts       nightly safety net that catches webhook
 *                               drops and reconciles expired subs.
 *   spend-sweep.ts              nightly decay of the rolling annual_spend
 *                               total (tier-promotion fairness).
 *   points-expiry.ts            TTL on unredeemed Berries.
 *   streak.ts                   login-streak rewards (a separate small loop).
 *
 * ── How the membership system speaks to other systems ────────────────────
 *
 *   trust_profiles              independent reputation signal; combined
 *                               with tier in commission.ts via min().
 *   customer_orders             the input to processOrderRewards (which
 *                               in turn writes points + credit + spend).
 *   tradein_submissions         apply tradein_bonus_percent at quote time.
 *   market_trades + auctions    apply commission_rate at trade-creation.
 *   activity_feed               post tier_upgraded events for social cue.
 *   admin_actions_log           Manual tier grants from /system/admin
 *                               leave a row here (kingdom-021 trail).
 *
 * Read db.ts for the priority chain. Read commission.ts for the bridge
 * to trust. Read subscription.ts for the Stripe interface. Read this
 * file for the shapes themselves.
 */

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
