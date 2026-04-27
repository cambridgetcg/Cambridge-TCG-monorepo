-- Auction module tables

DO $$ BEGIN
  CREATE TYPE auction_type AS ENUM ('english', 'dutch', 'buy_now');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE auction_status AS ENUM ('draft', 'scheduled', 'live', 'ended', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(300) NOT NULL,
  description TEXT,
  auction_type auction_type NOT NULL DEFAULT 'english',
  status auction_status NOT NULL DEFAULT 'draft',

  starting_price NUMERIC(10,2) NOT NULL,
  reserve_price NUMERIC(10,2),
  buy_now_price NUMERIC(10,2),
  bid_increment NUMERIC(10,2) NOT NULL DEFAULT 1.00,

  dutch_start_price NUMERIC(10,2),
  dutch_end_price NUMERIC(10,2),
  dutch_price_drop NUMERIC(10,2),
  dutch_drop_interval_seconds INT,

  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  actual_end_at TIMESTAMPTZ,

  current_price NUMERIC(10,2) NOT NULL,
  bid_count INT NOT NULL DEFAULT 0,
  winner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,

  stripe_session_id VARCHAR(200),
  stripe_payment_intent VARCHAR(200),
  paid_at TIMESTAMPTZ,

  allow_best_offer BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount NUMERIC(10,2) NOT NULL,
  is_best_offer BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auction_watches (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  auction_id UUID NOT NULL REFERENCES auctions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, auction_id)
);

CREATE INDEX IF NOT EXISTS idx_auctions_status ON auctions(status);
CREATE INDEX IF NOT EXISTS idx_auctions_status_ends ON auctions(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_auctions_type ON auctions(auction_type);
CREATE INDEX IF NOT EXISTS idx_auction_images_auction ON auction_images(auction_id);
CREATE INDEX IF NOT EXISTS idx_auction_bids_auction ON auction_bids(auction_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_auction_bids_user ON auction_bids(user_id);
CREATE INDEX IF NOT EXISTS idx_auction_watches_user ON auction_watches(user_id);
