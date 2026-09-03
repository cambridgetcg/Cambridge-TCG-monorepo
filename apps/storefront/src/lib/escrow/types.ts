export interface TradeReview {
  id: string;
  trade_id: string;
  reviewer_id: string;
  reviewee_id: string;
  role: "buyer" | "seller";
  rating: number;
  card_accuracy: number | null;
  shipping_speed: number | null;
  communication: number | null;
  comment: string | null;
  is_public: boolean;
  flagged: boolean;
  created_at: string;
  // Joined
  reviewer_name?: string | null;
  card_name?: string | null;
  trade_price?: string;
}

// One scored component of the trust score, carrying its own ceiling so a
// reader never has to know the weights to draw the bar.
export interface TrustComponent {
  points: number;
  max: number;
}

// One penalty, carrying its occurrence count and the per-occurrence cost so
// the page can say "2 open disputes (−10 each)" without doing the division.
export interface TrustPenalty {
  count: number;
  each: number;
  points: number;
}

// The engine's own working, published rather than recomputed.
//
// The account page used to re-derive these numbers from the profile row with
// its own copy of the formulas. The copies drifted (2026-06-10 moved identity
// verification's 10 pts into completion and reviews; the page kept the old
// 30/25 weights and a Verification bar for a component that no longer exists),
// so a seller was shown a breakdown that did not add up to their own score.
// The engine already computes every number below and used to throw them away.
export interface TrustScoreBreakdown {
  components: {
    completion: TrustComponent;
    review: TrustComponent;
    volume: TrustComponent;
    age: TrustComponent;
    external: TrustComponent;
  };
  penalties: {
    openDisputes: TrustPenalty;
    disputesLost: TrustPenalty;
    disputesSplit: TrustPenalty;
    fraudSignals: TrustPenalty;
  };
  // Sum of component points, before penalties.
  raw_score: number;
  // Sum of penalty points.
  penalty_total: number;
  // raw_score − penalty_total, clamped to 0..100.
  score: number;
  // True when the clamp actually bit — i.e. penalties exceeded components and
  // the score floored at 0. When this is true, "components − penalties = score"
  // is NOT arithmetically true, and the page must not claim it is.
  floored: boolean;
}

export interface TrustProfile {
  user_id: string;
  trust_score: number;
  seller_score: number;
  buyer_score: number;
  total_trades: number;
  completed_trades: number;
  cancelled_trades: number;
  disputed_trades: number;
  disputes_won: number;
  disputes_lost: number;
  avg_rating: string;
  total_reviews: number;
  positive_reviews: number;
  negative_reviews: number;
  total_volume: string;
  largest_trade: string;
  trade_limit: string;
  daily_limit: string;
  requires_escrow_inspection: boolean;
  external_rep: ExternalRep[];
  is_flagged: boolean;
  is_suspended: boolean;
  suspended_reason: string | null;
  suspended_until: string | null;
  // Attached by calculateTrustScore. Optional because the column-shaped reads
  // of trust_profiles elsewhere in the tree do not carry it.
  breakdown?: TrustScoreBreakdown;
}

export interface ExternalRep {
  platform: string;
  username: string;
  profile_url: string | null;
  rating: number | null;
  total_sales: number | null;
  positive_percent: number | null;
  member_since: string | null;
  verified: boolean;
}

export interface EscrowInspection {
  id: string;
  trade_id: string;
  listed_condition: string | null;
  actual_condition: string | null;
  condition_match: boolean | null;
  photos: string[];
  passed: boolean | null;
  rejection_reason: string | null;
  inspector_notes: string | null;
  inspected_at: string | null;
}

export interface FraudSignal {
  id: string;
  user_id: string;
  trade_id: string | null;
  signal_type: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  auto_action: string | null;
  resolved: boolean;
  created_at: string;
  user_name?: string | null;
  user_email?: string;
}

// Scam scenarios and protections
export const FRAUD_SIGNALS = {
  NEW_ACCOUNT_HIGH_VALUE: { type: "new_account_high_value", severity: "high" as const, desc: "New account attempting high-value trade" },
  RAPID_LISTING: { type: "rapid_listing", severity: "medium" as const, desc: "Unusual number of listings in short period" },
  SELF_TRADING: { type: "self_trading", severity: "critical" as const, desc: "Suspected self-dealing (same IP/device)" },
  MULTIPLE_DISPUTES: { type: "multiple_disputes", severity: "high" as const, desc: "Multiple disputes in recent trades" },
  CONDITION_MISMATCH_HISTORY: { type: "condition_mismatch", severity: "medium" as const, desc: "History of condition mismatches" },
  SHIPPING_DELAYS: { type: "shipping_delays", severity: "low" as const, desc: "Consistently late shipping" },
  REFUND_ABUSE: { type: "refund_abuse", severity: "high" as const, desc: "Suspicious refund pattern" },
  VELOCITY_SPIKE: { type: "velocity_spike", severity: "medium" as const, desc: "Sudden increase in trading volume" },
  NEGATIVE_REVIEWS: { type: "negative_reviews", severity: "medium" as const, desc: "Accumulating negative reviews" },
} as const;

// Trust tiers with limits
export const TRUST_TIERS = [
  { name: "New", minScore: 0, tradeLimit: 50, dailyLimit: 100, requiresInspection: true, payoutHoldDays: 7, color: "neutral" },
  { name: "Starter", minScore: 20, tradeLimit: 150, dailyLimit: 500, requiresInspection: true, payoutHoldDays: 5, color: "blue" },
  { name: "Trusted", minScore: 50, tradeLimit: 500, dailyLimit: 2000, requiresInspection: false, payoutHoldDays: 3, color: "emerald" },
  { name: "Veteran", minScore: 80, tradeLimit: 2000, dailyLimit: 10000, requiresInspection: false, payoutHoldDays: 1, color: "amber" },
  { name: "Elite", minScore: 95, tradeLimit: 10000, dailyLimit: 50000, requiresInspection: false, payoutHoldDays: 0, color: "purple" },
] as const;
