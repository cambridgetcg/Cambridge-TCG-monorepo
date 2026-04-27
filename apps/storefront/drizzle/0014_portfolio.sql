CREATE TABLE IF NOT EXISTS portfolio_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku VARCHAR(60) NOT NULL,
  card_name VARCHAR(300),
  card_number VARCHAR(30),
  set_code VARCHAR(20),
  set_name VARCHAR(100),
  image_url TEXT,
  rarity VARCHAR(20),
  condition VARCHAR(10) NOT NULL DEFAULT 'NM',
  quantity INT NOT NULL DEFAULT 1,
  acquisition_price NUMERIC(10,2),
  acquired_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, sku, condition)
);

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  total_value NUMERIC(12,2) NOT NULL,
  total_cost NUMERIC(12,2),
  card_count INT NOT NULL,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_cards_user ON portfolio_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_cards_sku ON portfolio_cards(sku);
CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_user ON portfolio_snapshots(user_id, snapshot_date DESC);
