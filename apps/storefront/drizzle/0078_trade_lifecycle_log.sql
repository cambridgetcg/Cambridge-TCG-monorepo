-- Append-only audit log for market trade transitions.
-- Mirrors auction_lifecycle_log; same shape so the journey/admin
-- aggregators can join uniformly.

CREATE TABLE IF NOT EXISTS trade_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  trade_id      UUID NOT NULL REFERENCES market_trades(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trade_log_subject
  ON trade_lifecycle_log(trade_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trade_log_action
  ON trade_lifecycle_log(action, created_at DESC);
