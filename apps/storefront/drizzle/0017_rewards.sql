-- Raffles and Mystery Boxes — points redemption rewards

DO $$ BEGIN
  CREATE TYPE raffle_status AS ENUM ('draft', 'active', 'drawing', 'completed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE mystery_box_status AS ENUM ('draft', 'active', 'paused', 'retired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── RAFFLES ──

CREATE TABLE IF NOT EXISTS raffles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  image_url TEXT,
  status raffle_status NOT NULL DEFAULT 'draft',
  -- Entry cost
  entry_cost_points INT NOT NULL DEFAULT 500,
  max_entries_per_user INT NOT NULL DEFAULT 10,
  -- Prize
  prize_description TEXT NOT NULL,
  prize_value NUMERIC(10,2),
  prize_type VARCHAR(30) NOT NULL DEFAULT 'physical',
  prize_image_url TEXT,
  -- Timing
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  draw_at TIMESTAMPTZ NOT NULL,
  -- Results
  total_entries INT NOT NULL DEFAULT 0,
  winner_user_id UUID REFERENCES users(id),
  winner_drawn_at TIMESTAMPTZ,
  winner_notified BOOLEAN NOT NULL DEFAULT false,
  -- Fulfillment
  prize_fulfilled BOOLEAN NOT NULL DEFAULT false,
  fulfillment_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS raffle_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_count INT NOT NULL DEFAULT 1,
  points_spent INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(raffle_id, user_id)
);

-- ── MYSTERY BOXES ──

CREATE TABLE IF NOT EXISTS mystery_boxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  image_url TEXT,
  status mystery_box_status NOT NULL DEFAULT 'draft',
  -- Cost
  cost_points INT NOT NULL DEFAULT 1000,
  -- Limits
  total_opens INT NOT NULL DEFAULT 0,
  max_opens_per_user INT NOT NULL DEFAULT 5,
  max_total_opens INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS mystery_box_rewards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES mystery_boxes(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  reward_type VARCHAR(30) NOT NULL,
  reward_value NUMERIC(10,2) NOT NULL,
  image_url TEXT,
  probability NUMERIC(5,4) NOT NULL,
  rarity VARCHAR(20) NOT NULL DEFAULT 'common',
  stock INT,
  awarded_count INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS mystery_box_opens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  box_id UUID NOT NULL REFERENCES mystery_boxes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reward_id UUID NOT NULL REFERENCES mystery_box_rewards(id),
  points_spent INT NOT NULL,
  fulfilled BOOLEAN NOT NULL DEFAULT false,
  fulfillment_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_raffles_status ON raffles(status);
CREATE INDEX IF NOT EXISTS idx_raffle_entries_raffle ON raffle_entries(raffle_id);
CREATE INDEX IF NOT EXISTS idx_raffle_entries_user ON raffle_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_mystery_boxes_status ON mystery_boxes(status);
CREATE INDEX IF NOT EXISTS idx_mystery_box_rewards_box ON mystery_box_rewards(box_id);
CREATE INDEX IF NOT EXISTS idx_mystery_box_opens_box ON mystery_box_opens(box_id);
CREATE INDEX IF NOT EXISTS idx_mystery_box_opens_user ON mystery_box_opens(user_id);
