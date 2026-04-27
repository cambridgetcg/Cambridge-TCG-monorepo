-- Liquidity mining: pay sellers in store credit when their resting asks
-- stay within N% of the card's recent VWAP for N+ hours. One reward per
-- (order, UTC day) so the cron can re-run safely.

BEGIN;

CREATE TABLE IF NOT EXISTS liquidity_rewards (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_id         UUID NOT NULL REFERENCES market_orders(id) ON DELETE CASCADE,
  sku              VARCHAR(60) NOT NULL,
  ask_price        NUMERIC(10,2) NOT NULL,
  vwap_at_reward   NUMERIC(10,2) NOT NULL,
  amount_gbp       NUMERIC(10,2) NOT NULL,
  awarded_for_date DATE NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_id, awarded_for_date)
);

CREATE INDEX IF NOT EXISTS idx_liquidity_rewards_user
  ON liquidity_rewards(user_id, created_at DESC);

COMMIT;
