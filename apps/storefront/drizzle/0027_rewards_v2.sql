-- Virtual pack opening + daily spin wheel + streak system

CREATE TABLE IF NOT EXISTS reward_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(200) NOT NULL,
  description TEXT,
  set_code VARCHAR(20),
  image_url TEXT,
  cost_points INT NOT NULL DEFAULT 1500,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  total_opens INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reward_pack_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES reward_packs(id) ON DELETE CASCADE,
  sku VARCHAR(60),
  card_name VARCHAR(300) NOT NULL,
  card_number VARCHAR(30),
  image_url TEXT,
  rarity VARCHAR(20) NOT NULL DEFAULT 'C',
  reward_type VARCHAR(20) NOT NULL DEFAULT 'points',
  reward_value NUMERIC(10,2) NOT NULL,
  probability NUMERIC(8,6) NOT NULL,
  stock INT,
  awarded INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS pack_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id UUID NOT NULL REFERENCES reward_packs(id),
  user_id UUID NOT NULL REFERENCES users(id),
  cards JSONB NOT NULL DEFAULT '[]',
  points_spent INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spin_config (
  id SERIAL PRIMARY KEY,
  segments JSONB NOT NULL DEFAULT '[]',
  free_spins_per_day INT NOT NULL DEFAULT 1,
  premium_cost_points INT NOT NULL DEFAULT 500,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS spin_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  segment_index INT NOT NULL,
  reward_type VARCHAR(20) NOT NULL,
  reward_value NUMERIC(10,2) NOT NULL,
  reward_label VARCHAR(100) NOT NULL,
  is_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_streaks (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INT NOT NULL DEFAULT 0,
  longest_streak INT NOT NULL DEFAULT 0,
  last_visit_date DATE,
  streak_multiplier NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  total_visits INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pack_opens_user ON pack_opens(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spin_results_user ON spin_results(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reward_pack_pools_pack ON reward_pack_pools(pack_id);
