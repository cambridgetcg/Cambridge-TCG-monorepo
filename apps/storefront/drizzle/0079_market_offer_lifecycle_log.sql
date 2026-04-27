-- Append-only audit log for market offer transitions.
-- Mirrors auction_lifecycle_log + trade_lifecycle_log.

CREATE TABLE IF NOT EXISTS market_offer_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  offer_id      UUID NOT NULL REFERENCES market_offers(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offer_log_subject
  ON market_offer_lifecycle_log(offer_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_offer_log_action
  ON market_offer_lifecycle_log(action, created_at DESC);
