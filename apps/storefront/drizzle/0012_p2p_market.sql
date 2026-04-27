DO $$ BEGIN
  CREATE TYPE order_side AS ENUM ('bid', 'ask');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE order_status AS ENUM ('open', 'filled', 'partially_filled', 'cancelled', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE trade_escrow_status AS ENUM (
    'awaiting_payment',
    'paid',
    'awaiting_shipment',
    'shipped_to_ctcg',
    'received_by_ctcg',
    'verified',
    'shipped_to_buyer',
    'completed',
    'disputed',
    'refunded',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS market_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  side order_side NOT NULL,
  sku VARCHAR(60) NOT NULL,
  card_name VARCHAR(300),
  set_code VARCHAR(20),
  set_name VARCHAR(100),
  image_url TEXT,
  condition VARCHAR(10) NOT NULL DEFAULT 'NM',
  price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  filled_quantity INT NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'open',
  notes TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bid_order_id UUID NOT NULL REFERENCES market_orders(id),
  ask_order_id UUID NOT NULL REFERENCES market_orders(id),
  buyer_id UUID NOT NULL REFERENCES users(id),
  seller_id UUID NOT NULL REFERENCES users(id),
  sku VARCHAR(60) NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  commission_rate NUMERIC(5,4) NOT NULL DEFAULT 0.0800,
  commission_amount NUMERIC(10,2) NOT NULL,
  seller_payout NUMERIC(10,2) NOT NULL,
  escrow_status trade_escrow_status NOT NULL DEFAULT 'awaiting_payment',
  stripe_payment_intent VARCHAR(200),
  buyer_paid_at TIMESTAMPTZ,
  seller_shipped_at TIMESTAMPTZ,
  ctcg_received_at TIMESTAMPTZ,
  ctcg_verified_at TIMESTAMPTZ,
  shipped_to_buyer_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  tracking_to_ctcg VARCHAR(100),
  tracking_to_buyer VARCHAR(100),
  dispute_reason TEXT,
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS market_trade_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES market_trades(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  url TEXT NOT NULL,
  s3_key TEXT NOT NULL,
  label VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_orders_sku ON market_orders(sku, side, status);
CREATE INDEX IF NOT EXISTS idx_market_orders_user ON market_orders(user_id, status);
CREATE INDEX IF NOT EXISTS idx_market_orders_status ON market_orders(status, side, price);
CREATE INDEX IF NOT EXISTS idx_market_trades_buyer ON market_trades(buyer_id);
CREATE INDEX IF NOT EXISTS idx_market_trades_seller ON market_trades(seller_id);
CREATE INDEX IF NOT EXISTS idx_market_trades_escrow ON market_trades(escrow_status);
CREATE INDEX IF NOT EXISTS idx_market_trades_sku ON market_trades(sku);
CREATE INDEX IF NOT EXISTS idx_market_trade_images_trade ON market_trade_images(trade_id);
