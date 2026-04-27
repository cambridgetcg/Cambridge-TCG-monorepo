-- Escrow trust layer: reviews, trust scores, trade protection, anti-fraud

-- ══════════════════════════════════════════════════════════════
-- REVIEWS (post-trade ratings)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trade_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id),
  reviewer_id UUID NOT NULL REFERENCES users(id),
  reviewee_id UUID NOT NULL REFERENCES users(id),
  role VARCHAR(10) NOT NULL, -- 'buyer' or 'seller'
  -- Rating
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  card_accuracy INT CHECK (card_accuracy >= 1 AND card_accuracy <= 5),
  shipping_speed INT CHECK (shipping_speed >= 1 AND shipping_speed <= 5),
  communication INT CHECK (communication >= 1 AND communication <= 5),
  comment TEXT,
  -- Moderation
  is_public BOOLEAN NOT NULL DEFAULT true,
  flagged BOOLEAN NOT NULL DEFAULT false,
  admin_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(trade_id, reviewer_id)
);

-- ══════════════════════════════════════════════════════════════
-- TRUST SCORES (computed from activity)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS trust_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Computed scores (0-100)
  trust_score INT NOT NULL DEFAULT 0,
  seller_score INT NOT NULL DEFAULT 0,
  buyer_score INT NOT NULL DEFAULT 0,
  -- Trade stats
  total_trades INT NOT NULL DEFAULT 0,
  completed_trades INT NOT NULL DEFAULT 0,
  cancelled_trades INT NOT NULL DEFAULT 0,
  disputed_trades INT NOT NULL DEFAULT 0,
  disputes_won INT NOT NULL DEFAULT 0,
  disputes_lost INT NOT NULL DEFAULT 0,
  -- Review stats
  avg_rating NUMERIC(3,2) NOT NULL DEFAULT 0,
  total_reviews INT NOT NULL DEFAULT 0,
  positive_reviews INT NOT NULL DEFAULT 0,
  negative_reviews INT NOT NULL DEFAULT 0,
  -- Financial
  total_volume NUMERIC(12,2) NOT NULL DEFAULT 0,
  largest_trade NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Limits (based on trust)
  trade_limit NUMERIC(10,2) NOT NULL DEFAULT 50.00,
  daily_limit NUMERIC(10,2) NOT NULL DEFAULT 200.00,
  requires_escrow_inspection BOOLEAN NOT NULL DEFAULT true,
  -- Cross-platform credibility
  external_rep JSONB NOT NULL DEFAULT '[]',
  -- Flags
  is_flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  suspended_reason TEXT,
  suspended_until TIMESTAMPTZ,
  -- Timestamps
  last_calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- CROSS-PLATFORM REPUTATION (imported from eBay, Cardmarket, etc.)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS external_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform VARCHAR(30) NOT NULL, -- 'ebay', 'cardmarket', 'tcgplayer', 'vinted'
  username VARCHAR(200) NOT NULL,
  profile_url TEXT,
  -- Stats from the platform
  rating NUMERIC(3,2),
  total_sales INT,
  positive_percent NUMERIC(5,2),
  member_since DATE,
  -- Verification
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_method VARCHAR(30), -- 'screenshot', 'api', 'admin_manual'
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES users(id),
  screenshot_url TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, platform)
);

-- ══════════════════════════════════════════════════════════════
-- ESCROW WORKFLOW (enhanced)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS escrow_inspections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id),
  inspector_notes TEXT,
  -- Seller's listed condition vs actual
  listed_condition VARCHAR(10),
  actual_condition VARCHAR(10),
  condition_match BOOLEAN,
  -- Photos taken at CTCG on receipt
  photos JSONB NOT NULL DEFAULT '[]',
  -- Decision
  passed BOOLEAN,
  rejection_reason TEXT,
  inspected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- PAYOUT HOLDS (anti-fraud cooling period)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS payout_holds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  amount NUMERIC(10,2) NOT NULL,
  hold_reason VARCHAR(50) NOT NULL,
  hold_until TIMESTAMPTZ NOT NULL,
  released BOOLEAN NOT NULL DEFAULT false,
  released_at TIMESTAMPTZ,
  cancelled BOOLEAN NOT NULL DEFAULT false,
  cancelled_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- FRAUD SIGNALS (automated detection)
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS fraud_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  trade_id UUID REFERENCES market_trades(id),
  signal_type VARCHAR(50) NOT NULL,
  severity VARCHAR(10) NOT NULL DEFAULT 'low', -- low, medium, high, critical
  description TEXT NOT NULL,
  auto_action VARCHAR(30), -- 'none', 'flag', 'hold_payout', 'suspend', 'block_trade'
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_by UUID REFERENCES users(id),
  resolved_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add trust fields to users
ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trade_count INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_trade_reviews_trade ON trade_reviews(trade_id);
CREATE INDEX IF NOT EXISTS idx_trade_reviews_reviewee ON trade_reviews(reviewee_id);
CREATE INDEX IF NOT EXISTS idx_trust_profiles_user ON trust_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_trust_profiles_score ON trust_profiles(trust_score DESC);
CREATE INDEX IF NOT EXISTS idx_external_reputation_user ON external_reputation(user_id);
CREATE INDEX IF NOT EXISTS idx_escrow_inspections_trade ON escrow_inspections(trade_id);
CREATE INDEX IF NOT EXISTS idx_payout_holds_seller ON payout_holds(seller_id, released);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_user ON fraud_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_fraud_signals_severity ON fraud_signals(severity, resolved);
