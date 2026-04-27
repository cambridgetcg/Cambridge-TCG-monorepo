-- Append-only audit log for watch + price-alert transitions.
-- Single table covers BOTH market_watches (no UUID — composite PK)
-- and price_alerts (UUID PK), discriminated via subject_kind plus
-- the relevant key fields. Keeps the journey aggregator simple
-- (one fetch, one ORDER BY) instead of two parallel tables.

CREATE TABLE IF NOT EXISTS watch_alert_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subject_kind  VARCHAR(20) NOT NULL,  -- 'watch' | 'alert'
  alert_id      UUID REFERENCES price_alerts(id) ON DELETE CASCADE,
  sku           VARCHAR(60),
  action        VARCHAR(40) NOT NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (subject_kind IN ('watch', 'alert'))
);

CREATE INDEX IF NOT EXISTS idx_watch_alert_log_user
  ON watch_alert_lifecycle_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_alert_log_alert
  ON watch_alert_lifecycle_log(alert_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_watch_alert_log_action
  ON watch_alert_lifecycle_log(action, created_at DESC);
