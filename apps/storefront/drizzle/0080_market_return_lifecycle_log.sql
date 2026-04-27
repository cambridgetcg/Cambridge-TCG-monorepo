-- Append-only audit log for market return transitions.
-- Mirrors auction/trade/offer lifecycle log shape.

CREATE TABLE IF NOT EXISTS market_return_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  return_id     UUID NOT NULL REFERENCES market_returns(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_log_subject
  ON market_return_lifecycle_log(return_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_return_log_action
  ON market_return_lifecycle_log(action, created_at DESC);
