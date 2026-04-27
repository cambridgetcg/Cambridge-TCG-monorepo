-- Pricing rules — seller-side auto-response on incoming offers.
--
-- The offers module (migration 0069, lib at @/lib/market/offers)
-- gives buyers a negotiation channel against asks. The seller's
-- side of that conversation is "accept | decline | counter," and
-- in practice a slice of offers are obvious lowballs the seller
-- will always decline at the same threshold. This module lets
-- them encode that triage as a rule.
--
-- Rule types:
--   auto_decline  — reject any offer below threshold_pct of ask price
--   auto_counter  — reject below threshold_pct, then auto-counter at
--                   counter_pct of ask price (must be > threshold_pct
--                   so the counter doesn't itself trip the threshold)
--
-- Rules are evaluated INLINE inside makeOffer's success path. The
-- auto-action calls back through the existing declineOffer /
-- counterOffer lib functions — no separate code path, no separate
-- notification kinds. From the buyer's perspective the offer just
-- transitions immediately instead of sitting in 'pending'.

CREATE TABLE IF NOT EXISTS pricing_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- User-supplied label so /account/pricing-rules + the auto-decline
  -- response can name it ("Auto-decline by rule: 'Charizard floor'")
  -- instead of dumping the JSON filter.
  name            VARCHAR(80) NOT NULL,

  -- Which asks this rule applies to. Empty {} = ALL of seller's asks.
  -- Same JSONB shape as saved_searches.query so a future "save this
  -- saved-search as a pricing rule" affordance is symmetric.
  --   sku_pattern : ILIKE pattern (e.g., 'OP01-%')
  --   set_codes   : array (OR'd)
  --   conditions  : array (OR'd)
  --   min_ask     : numeric (only target asks at this price or higher)
  --   max_ask     : numeric
  listing_filter  JSONB NOT NULL DEFAULT '{}'::jsonb,

  rule_type       VARCHAR(20) NOT NULL CHECK (rule_type IN ('auto_decline', 'auto_counter')),

  -- Reject offers below (ask_price * threshold_pct / 100). e.g.
  -- threshold_pct=80 means "reject anything below 80% of ask."
  threshold_pct   NUMERIC(5, 2) NOT NULL CHECK (threshold_pct > 0 AND threshold_pct <= 100),

  -- For auto_counter: counter at (ask_price * counter_pct / 100).
  -- Must be strictly greater than threshold_pct — otherwise the
  -- counter-price would itself trip the threshold and bounce.
  counter_pct     NUMERIC(5, 2) CHECK (counter_pct IS NULL OR (counter_pct > 0 AND counter_pct < 100)),

  -- Optional message attached to the auto-decline / auto-counter so
  -- the buyer's notification body explains the reason.
  response_message TEXT,

  -- Lifecycle. Same shape as saved_searches: active → paused →
  -- archived (terminal). No 'expired' state — rules are open-ended
  -- until the seller archives.
  status          VARCHAR(20) NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'archived')),

  -- Stats — drives "Rule fired N times, last triggered X" on the page.
  trigger_count       INT NOT NULL DEFAULT 0,
  last_triggered_at   TIMESTAMPTZ,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- auto_counter rules MUST have counter_pct; auto_decline rules
  -- MUST NOT have it. Enforced at the column level so a malformed
  -- INSERT can't bypass the lib's validateRule check.
  CHECK (
    (rule_type = 'auto_decline' AND counter_pct IS NULL)
    OR
    (rule_type = 'auto_counter' AND counter_pct IS NOT NULL AND counter_pct > threshold_pct)
  )
);

-- "My rules, newest first." Powers /account/pricing-rules.
CREATE INDEX IF NOT EXISTS idx_pricing_rules_user
  ON pricing_rules (user_id, created_at DESC);

-- Hot-path lookup inside makeOffer — "what active rules does this
-- seller have?" Partial idx on status='active' so the scan is
-- index-only against typical workloads where most rules are paused
-- or archived.
CREATE INDEX IF NOT EXISTS idx_pricing_rules_active
  ON pricing_rules (user_id) WHERE status = 'active';
