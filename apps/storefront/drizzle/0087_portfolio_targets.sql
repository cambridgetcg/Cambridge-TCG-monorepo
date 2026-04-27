-- Investor position targets — entry / exit / stop levels per holding
-- with optional free-text thesis. Distinct from price_alerts (which
-- are free-floating per-SKU thresholds) — these are tied to the
-- investor's intent on a specific portfolio thesis.
--
-- The triple of (target_buy, target_sell, target_stop) is intentional:
--   target_buy   = "I want more at this price" (accumulation)
--   target_sell  = "I'd take profit here" (price targets up)
--   target_stop  = "Cut the position here" (loss control / regime change)
-- Any subset of the three may be NULL — investors who only care about
-- exit price set just target_sell.
--
-- Status:
--   active    = sweep watches it
--   paused    = user temporarily stopped the watch
--   hit       = one of the levels triggered (hit_kind says which);
--               sweep stops watching, user is notified, the row is
--               retained as audit ("you sold this one")
--   cancelled = user manually closed without a hit

CREATE TABLE IF NOT EXISTS portfolio_targets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sku                VARCHAR(60) NOT NULL,
  condition          VARCHAR(10) NOT NULL DEFAULT 'NM',

  target_buy_price   NUMERIC(10,2),
  target_sell_price  NUMERIC(10,2),
  target_stop_price  NUMERIC(10,2),

  thesis             TEXT,

  status             VARCHAR(15) NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active', 'paused', 'hit', 'cancelled')),
  hit_kind           VARCHAR(10) CHECK (hit_kind IN ('buy', 'sell', 'stop')),
  hit_price          NUMERIC(10,2),
  hit_at             TIMESTAMPTZ,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sanity: at least one target level must be set on creation.
  CHECK (
       target_buy_price IS NOT NULL
    OR target_sell_price IS NOT NULL
    OR target_stop_price IS NOT NULL
  ),
  -- Order constraints (within-direction): stop < buy ≤ sell.
  -- Any of the three can be NULL; only enforce when the pair is set.
  CHECK (
    target_stop_price IS NULL OR target_buy_price IS NULL
    OR target_stop_price < target_buy_price
  ),
  CHECK (
    target_buy_price IS NULL OR target_sell_price IS NULL
    OR target_buy_price <= target_sell_price
  )
);

CREATE INDEX IF NOT EXISTS idx_portfolio_targets_user
  ON portfolio_targets(user_id, status);

CREATE INDEX IF NOT EXISTS idx_portfolio_targets_active_sku
  ON portfolio_targets(sku) WHERE status = 'active';

-- Append-only audit log for target transitions. Mirrors the rest of
-- the lifecycle log family. 'hit' rows carry the trigger price + kind
-- in metadata.

CREATE TABLE IF NOT EXISTS portfolio_target_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  target_id     UUID NOT NULL REFERENCES portfolio_targets(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pft_log_subject
  ON portfolio_target_lifecycle_log(target_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pft_log_action
  ON portfolio_target_lifecycle_log(action, created_at DESC);
