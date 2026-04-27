-- Audit log of pull-token merges. Feeds the "lineage" narrative and lets
-- admins detect anomalous merge patterns.

CREATE TABLE IF NOT EXISTS bounty_merges (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  from_tier       VARCHAR(20) NOT NULL,
  to_tier         VARCHAR(20) NOT NULL,
  tokens_consumed INT NOT NULL DEFAULT 4,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bounty_merges_user ON bounty_merges(user_id, created_at DESC);
