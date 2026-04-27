-- Bounty Board — phygital play-to-earn layer.
-- Cards won from PVE are held in `vault_items` (digital) backed 1:1 by SKUs
-- whose physical copies come from wholesaletcgdirect when redeemed.
-- "Reservation" is implicit: a count of vault_items.status='reserved' for a
-- SKU is subtracted from the live wholesale stock before new pulls roll that
-- SKU in. No local products table, no stored reservation counter.

-- ── Pull tokens earned by the player, not yet resolved ──
CREATE TABLE IF NOT EXISTS bounty_pull_tokens (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL,
  count INT NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, tier)
);

-- ── Tier configuration (admin-editable loot tables) ──
CREATE TABLE IF NOT EXISTS bounty_pull_tiers (
  tier VARCHAR(20) PRIMARY KEY,
  display_name VARCHAR(50) NOT NULL,
  target_ev_pence INT NOT NULL,
  weekly_global_cap INT,
  rarity_weights JSONB NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO bounty_pull_tiers (tier, display_name, target_ev_pence, weekly_global_cap, rarity_weights) VALUES
  ('common',     'Common Pull',      10,   NULL, '{"C":0.80,"UC":0.20}'::jsonb),
  ('uncommon',   'Uncommon Pull',    40,   NULL, '{"C":0.30,"UC":0.60,"R":0.10}'::jsonb),
  ('rare',       'Rare Pull',       150,    500, '{"UC":0.30,"R":0.60,"SR":0.10}'::jsonb),
  ('super_rare', 'Super Rare Pull', 600,    100, '{"R":0.40,"SR":0.50,"L":0.08,"SEC":0.02}'::jsonb),
  ('legendary',  'Legendary Pull', 3000,     10, '{"SR":0.30,"L":0.40,"SEC":0.30}'::jsonb)
ON CONFLICT (tier) DO NOTHING;

-- ── Vault — digital cards acquired by the user ──
-- status transitions: reserved -> {redeemed|sold_back|traded|gifted|expired}
CREATE TABLE IF NOT EXISTS vault_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- card identity (snapshot at acquisition time so display doesn't drift)
  sku VARCHAR(100) NOT NULL,
  card_name VARCHAR(200) NOT NULL,
  card_number VARCHAR(50),
  set_code VARCHAR(20),
  rarity VARCHAR(20),
  image_url TEXT,

  -- price snapshot — freezes sell-back math to the moment of acquisition
  spot_price_gbp NUMERIC(10,2) NOT NULL,

  -- provenance
  source VARCHAR(30) NOT NULL,              -- pve_milestone | pve_daily | streak | promo | merge
  source_reference_id UUID,
  bounty_pull_id UUID,                       -- set after resolve-pull links back

  -- lifecycle
  status VARCHAR(20) NOT NULL DEFAULT 'reserved',
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  p2p_hold_until TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '48 hours'),

  -- terminal-state fields
  redemption_order_id INT REFERENCES customer_orders(id),
  fulfilled_at TIMESTAMPTZ,
  sold_back_credit NUMERIC(10,2),
  sold_back_at TIMESTAMPTZ,
  traded_to_user_id UUID REFERENCES users(id),
  traded_at TIMESTAMPTZ,

  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vault_items_user_status
  ON vault_items(user_id, status);
CREATE INDEX IF NOT EXISTS idx_vault_items_sku_reserved
  ON vault_items(sku) WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_vault_items_expires
  ON vault_items(expires_at) WHERE status = 'reserved';

-- ── Pulls — audit log + provably-fair proof trail ──
CREATE TABLE IF NOT EXISTS bounty_pulls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(20) NOT NULL,
  earned_from VARCHAR(30) NOT NULL,

  rolled_rarity VARCHAR(20),
  rolled_sku VARCHAR(100),
  rolled_spot_gbp NUMERIC(10,2),

  -- commit-reveal RNG: commitment is published before roll, seed revealed after
  rng_server_seed_hash CHAR(64) NOT NULL,
  rng_server_seed CHAR(64),
  rng_client_seed VARCHAR(100),
  rng_nonce BIGINT,

  vault_item_id UUID REFERENCES vault_items(id),
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bounty_pulls_user ON bounty_pulls(user_id, resolved_at DESC);

-- ── KYC gate for pulls + redemption ──
CREATE TABLE IF NOT EXISTS user_bounty_eligibility (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  phone_verified BOOLEAN NOT NULL DEFAULT false,
  phone_verified_at TIMESTAMPTZ,
  phone_number VARCHAR(30),
  first_order_paid BOOLEAN NOT NULL DEFAULT false,
  first_order_paid_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
