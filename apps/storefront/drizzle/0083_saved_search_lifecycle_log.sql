-- Append-only audit log for saved search transitions.
-- Mirrors the rest of the lifecycle log family. 'matched_notified'
-- rows are high-cardinality (one per buyer notification fired by
-- the sweep) — same shape as pricing_rule_lifecycle_log's 'fired'.

CREATE TABLE IF NOT EXISTS saved_search_lifecycle_log (
  id            BIGSERIAL PRIMARY KEY,
  search_id     UUID NOT NULL REFERENCES saved_searches(id) ON DELETE CASCADE,
  action        VARCHAR(40) NOT NULL,
  actor_id      UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_search_log_subject
  ON saved_search_lifecycle_log(search_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_saved_search_log_action
  ON saved_search_lifecycle_log(action, created_at DESC);
