-- Append-only audit log for market lot listing + lot trade transitions.
-- Single table covers both surfaces (listing + escrow) so a lot's full
-- arc is queryable in one ORDER BY without union plumbing. Discriminated
-- via subject_kind + subject_id (NULL the FK that doesn't apply).
-- Mirrors the auction/trade/offer/return lifecycle log shape.

CREATE TABLE IF NOT EXISTS market_lot_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  lot_id        UUID REFERENCES market_lots(id) ON DELETE CASCADE,
  lot_trade_id  UUID REFERENCES market_lot_trades(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (lot_id IS NOT NULL OR lot_trade_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_lot_log_lot
  ON market_lot_lifecycle_log(lot_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lot_log_lot_trade
  ON market_lot_lifecycle_log(lot_trade_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_lot_log_action
  ON market_lot_lifecycle_log(action, created_at DESC);
