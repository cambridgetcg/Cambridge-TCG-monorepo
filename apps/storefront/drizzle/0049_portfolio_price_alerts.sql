-- Per-user price-threshold alerts on individual SKUs.
--
-- Evaluation: runPriceAlertSweep() in the daily price-history cron reads
-- every enabled row, compares latest spot_gbp vs threshold, and queues the
-- alert email via email_queue with idempotency key
-- "portfolio_price_alert:<id>:<captured_on>". That means alerts fire at
-- most once per day per alert, even if the cron runs every minute.
--
-- last_notified_at rate-limits re-firing: after an alert fires, it won't
-- fire again until at least 7 days pass OR the price moves back across the
-- threshold and re-crosses. Users can also disable + re-enable to reset.

CREATE TABLE IF NOT EXISTS portfolio_price_alerts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku               VARCHAR(60) NOT NULL,
  -- 'above' means "notify me when spot rises above threshold"
  -- 'below' means "notify me when spot drops below threshold"
  direction         VARCHAR(10) NOT NULL CHECK (direction IN ('above', 'below')),
  threshold_gbp     NUMERIC(10,2) NOT NULL CHECK (threshold_gbp >= 0),
  enabled           BOOLEAN NOT NULL DEFAULT true,
  last_notified_at  TIMESTAMPTZ,
  -- snapshot for display / UI context
  card_name         VARCHAR(300),
  card_number       VARCHAR(30),
  image_url         TEXT,
  note              TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- one alert per (user, sku, direction); user can have two alerts for the
  -- same SKU if they want both above + below.
  UNIQUE (user_id, sku, direction)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_price_alerts_user
  ON portfolio_price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_price_alerts_enabled
  ON portfolio_price_alerts(enabled) WHERE enabled = true;
