-- Market watchlists + price alerts.
--
-- market_watches: a simple "star this card" list. One row per (user, sku).
-- price_alerts:   user-defined conditions to trigger an email when crossed.
--                 Direction = 'below' fires when best_ask <= threshold,
--                 'above' fires when last trade >= threshold.
--                 24-hour cooldown per alert (last_fired_at) prevents spam.

BEGIN;

CREATE TABLE IF NOT EXISTS market_watches (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku        VARCHAR(60) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, sku)
);

CREATE INDEX IF NOT EXISTS idx_market_watches_sku ON market_watches(sku);

CREATE TABLE IF NOT EXISTS price_alerts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku             VARCHAR(60) NOT NULL,
  threshold_price NUMERIC(10,2) NOT NULL,
  direction       VARCHAR(10) NOT NULL,   -- 'below' | 'above'
  active          BOOLEAN NOT NULL DEFAULT true,
  last_fired_at   TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user   ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_active ON price_alerts(sku, active) WHERE active = true;

COMMIT;
