-- Membership system: tiers, points, cashback
-- Ported from RewardsPro business logic

CREATE TABLE IF NOT EXISTS tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  icon VARCHAR(10) NOT NULL DEFAULT '⭐',
  color VARCHAR(7) NOT NULL DEFAULT '#FFD700',
  sort_order INT NOT NULL DEFAULT 0,
  -- Qualification
  min_annual_spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  -- Perks
  cashback_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  points_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  tradein_bonus_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  p2p_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0800,
  auction_commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.1200,
  auction_priority_approval BOOLEAN NOT NULL DEFAULT false,
  benefits JSONB NOT NULL DEFAULT '[]',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INT NOT NULL,
  balance INT NOT NULL,
  type VARCHAR(30) NOT NULL,
  description TEXT,
  reference_id VARCHAR(200),
  reference_type VARCHAR(30),
  expires_at TIMESTAMPTZ,
  expired BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  balance NUMERIC(10,2) NOT NULL,
  type VARCHAR(30) NOT NULL,
  description TEXT,
  reference_id VARCHAR(200),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS points_config (
  id SERIAL PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  currency_name VARCHAR(30) NOT NULL DEFAULT 'Points',
  currency_icon VARCHAR(10) NOT NULL DEFAULT '⭐',
  points_per_pound INT NOT NULL DEFAULT 10,
  rounding_mode VARCHAR(10) NOT NULL DEFAULT 'FLOOR',
  points_expire BOOLEAN NOT NULL DEFAULT false,
  expiration_days INT NOT NULL DEFAULT 365,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default tiers
INSERT INTO tiers (name, description, icon, color, sort_order, min_annual_spend, cashback_percent, points_multiplier, tradein_bonus_percent, p2p_commission_rate, auction_commission_rate, auction_priority_approval, benefits)
VALUES
  ('Bronze', 'Welcome tier for all members', '🥉', '#CD7F32', 0, 0, 0, 1.00, 0, 0.0800, 0.1200, false, '["Track your card portfolio", "Access P2P marketplace", "List cards at auction"]'::jsonb),
  ('Silver', 'For dedicated collectors spending £100+/year', '🥈', '#C0C0C0', 1, 100, 3, 1.50, 5, 0.0600, 0.1000, false, '["3% cashback on purchases", "1.5x points multiplier", "5% trade-in bonus", "6% P2P commission (was 8%)", "10% auction commission (was 12%)"]'::jsonb),
  ('Gold', 'For serious collectors spending £500+/year', '🥇', '#FFD700', 2, 500, 5, 2.00, 10, 0.0500, 0.0800, true, '["5% cashback on purchases", "2x points multiplier", "10% trade-in bonus", "5% P2P commission (was 8%)", "8% auction commission (was 12%)", "Priority auction approval"]'::jsonb)
ON CONFLICT (name) DO NOTHING;

-- Seed default points config
INSERT INTO points_config (is_enabled, points_per_pound) VALUES (true, 10) ON CONFLICT DO NOTHING;

-- Add tier_id FK to users (replacing the text membership_tier)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_id UUID REFERENCES tiers(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS points_balance INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS lifetime_points INT NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS annual_spend NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS total_spend NUMERIC(10,2) NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_source VARCHAR(30) NOT NULL DEFAULT 'spending';
ALTER TABLE users ADD COLUMN IF NOT EXISTS tier_calculated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_points_ledger_user ON points_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_store_credit_ledger_user ON store_credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier_id);
CREATE INDEX IF NOT EXISTS idx_tiers_sort ON tiers(sort_order);
