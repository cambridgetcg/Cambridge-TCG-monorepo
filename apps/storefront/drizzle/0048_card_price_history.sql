-- Daily price snapshots for every SKU that any user is tracking
-- (portfolio_cards) or has alerts on. Drives:
--   - per-card 7d / 30d % change badges on /account/portfolio
--   - top-gainers / top-losers panel
--   - price-alert evaluation (portfolio_price_alerts, future)
--
-- Write pattern: the cron computes the set of "interesting SKUs" and samples
-- current prices once per UTC day, upserting one row per (sku, captured_on).
-- Read pattern: range queries by SKU over N days.
--
-- We store the retail "spot" (what the storefront asks) as the canonical
-- price. P2P best-bid/best-ask can be added as nullable columns later if we
-- need them — for now the single column keeps the write cheap.

CREATE TABLE IF NOT EXISTS card_price_history (
  sku           VARCHAR(60) NOT NULL,
  captured_on   DATE NOT NULL DEFAULT CURRENT_DATE,
  spot_gbp      NUMERIC(10,2) NOT NULL,
  -- nullable "secondary" columns so we can enrich later without a migration
  wholesale_gbp NUMERIC(10,2),
  best_bid_gbp  NUMERIC(10,2),
  best_ask_gbp  NUMERIC(10,2),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sku, captured_on)
);

CREATE INDEX IF NOT EXISTS idx_card_price_history_sku_recent
  ON card_price_history (sku, captured_on DESC);
