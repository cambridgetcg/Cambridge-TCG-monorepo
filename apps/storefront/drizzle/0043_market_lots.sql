-- Lot / bundle trading — seller-listed bundles of cards at a fixed price.
-- Atomic: a buyer buys the whole lot, not partials. Separate tables from
-- market_orders / market_trades because the matching semantics are
-- different (fixed-price listing, no order book) even though the escrow
-- / payout lifecycle is identical.

BEGIN;

CREATE TABLE IF NOT EXISTS market_lots (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title            VARCHAR(200) NOT NULL,
  description      TEXT,
  price            NUMERIC(10,2) NOT NULL,
  image_url        TEXT,
  -- active | sold | cancelled (no draft — either listed or not)
  status           VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_lots_seller ON market_lots(seller_user_id, status);
CREATE INDEX IF NOT EXISTS idx_market_lots_status ON market_lots(status, created_at DESC);

CREATE TABLE IF NOT EXISTS market_lot_items (
  lot_id     UUID NOT NULL REFERENCES market_lots(id) ON DELETE CASCADE,
  sku        VARCHAR(60) NOT NULL,
  card_name  TEXT,
  quantity   INT NOT NULL DEFAULT 1,
  PRIMARY KEY (lot_id, sku)
);

-- Lot trades mirror market_trades in lifecycle, minus the order-book fields
CREATE TABLE IF NOT EXISTS market_lot_trades (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                   UUID NOT NULL REFERENCES market_lots(id) ON DELETE RESTRICT,
  buyer_user_id            UUID NOT NULL REFERENCES users(id),
  seller_user_id           UUID NOT NULL REFERENCES users(id),
  price                    NUMERIC(10,2) NOT NULL,      -- snapshot at purchase
  commission_rate          NUMERIC(5,4) NOT NULL DEFAULT 0.0800,
  commission_amount        NUMERIC(10,2) NOT NULL,
  seller_payout            NUMERIC(10,2) NOT NULL,
  escrow_status            VARCHAR(30) NOT NULL DEFAULT 'awaiting_payment',
  payment_expires_at       TIMESTAMPTZ,
  stripe_session_id        TEXT,
  stripe_payment_intent    TEXT,
  stripe_transfer_id       TEXT,
  buyer_paid_at            TIMESTAMPTZ,
  seller_shipped_at        TIMESTAMPTZ,
  completed_at             TIMESTAMPTZ,
  tracking_number          VARCHAR(100),
  seller_paid_at           TIMESTAMPTZ,
  payout_method            VARCHAR(30),
  payout_reference         VARCHAR(200),
  admin_notes              TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_lot_trades_buyer   ON market_lot_trades(buyer_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_lot_trades_seller  ON market_lot_trades(seller_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_lot_trades_lot     ON market_lot_trades(lot_id);
CREATE INDEX IF NOT EXISTS idx_market_lot_trades_escrow  ON market_lot_trades(escrow_status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lot_trades_stripe_session
  ON market_lot_trades(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;

COMMIT;
