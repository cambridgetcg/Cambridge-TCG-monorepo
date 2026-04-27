-- Tiered escrow: direct ship, verified ship, full escrow

ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS escrow_tier VARCHAR(20) NOT NULL DEFAULT 'full_escrow';
ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS requires_photos BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS requires_inspection BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS seller_ships_to VARCHAR(10) NOT NULL DEFAULT 'ctcg';
ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS dispute_window_hours INT NOT NULL DEFAULT 168;
ALTER TABLE market_trades ADD COLUMN IF NOT EXISTS payout_hold_days INT NOT NULL DEFAULT 5;

-- Seller photo uploads for verified ship tier
CREATE TABLE IF NOT EXISTS trade_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  photo_type VARCHAR(20) NOT NULL DEFAULT 'card', -- card_front, card_back, packaging
  approved BOOLEAN,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_photos_trade ON trade_photos(trade_id);
