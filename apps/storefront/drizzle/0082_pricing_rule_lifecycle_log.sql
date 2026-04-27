-- Append-only audit log for pricing rule transitions.
-- Mirrors auction/trade/offer/return/lot lifecycle log shape.
-- 'fired' rows are the high-cardinality entries (one per offer the
-- rule auto-decides) — index on (rule_id, created_at DESC) keeps
-- per-rule history queries fast even with thousands of fires.

CREATE TABLE IF NOT EXISTS pricing_rule_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  rule_id       UUID NOT NULL REFERENCES pricing_rules(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_rule_log_subject
  ON pricing_rule_lifecycle_log(rule_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pricing_rule_log_action
  ON pricing_rule_lifecycle_log(action, created_at DESC);
