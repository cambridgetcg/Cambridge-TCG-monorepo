-- Audit trail for every pull-token grant.
--
-- Without this table, a "where did my token come from?" support ticket
-- has no answer — bounty_pull_tokens only stores current counts. Every
-- grant (PVE milestone, daily bonus, merge mint, refund, manual) writes
-- a row here so admin can reconstruct provenance and so support can
-- spot abuse patterns.

BEGIN;

CREATE TABLE IF NOT EXISTS bounty_token_grants (
  id                   BIGSERIAL PRIMARY KEY,
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tier                 VARCHAR(20) NOT NULL,
  count                INT NOT NULL CHECK (count > 0),
  source               VARCHAR(30) NOT NULL,
  -- pve_milestone | pve_daily | merge_mint | refund_no_stock | manual_admin | promo
  source_reference_id  UUID,
  description          TEXT,
  granted_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bounty_token_grants_user_time
  ON bounty_token_grants(user_id, granted_at DESC);
CREATE INDEX IF NOT EXISTS idx_bounty_token_grants_source
  ON bounty_token_grants(source, granted_at DESC);

-- Idempotency lookup used by the PVE rewards helper to detect prior
-- grants for a given gameId. Partial index keeps it small.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bounty_token_grants_pve_milestone_ref
  ON bounty_token_grants(source, source_reference_id)
  WHERE source = 'pve_milestone' AND source_reference_id IS NOT NULL;

COMMIT;
