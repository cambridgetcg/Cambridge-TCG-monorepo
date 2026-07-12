-- Privacy by default for every person-facing community surface.
--
-- Earlier migrations made profiles, feed entries, unsolicited messages and
-- collective membership visibility public/on by default. This migration adds
-- the receipt columns and changes defaults only. It deliberately does not
-- rewrite existing person data during application deployment.
--
-- The operator-only reset command records affected identifiers and previous
-- settings here. It is dry-run by default and runs separately after the gated
-- application is live; see scripts/reset-person-publication.ts.

CREATE TABLE IF NOT EXISTS privacy_publication_reset_20260711 (
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  previous_value TEXT NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (record_type, record_id)
);

CREATE TABLE IF NOT EXISTS privacy_publication_reset_20260711_runs (
  reset_key TEXT PRIMARY KEY,
  cutoff_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  result_counts JSONB NOT NULL DEFAULT '{}'::JSONB
);

ALTER TABLE privacy_publication_reset_20260711_runs
  ADD COLUMN IF NOT EXISTS cutoff_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS result_counts JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE privacy_publication_reset_20260711_runs
  ALTER COLUMN cutoff_at SET NOT NULL,
  ALTER COLUMN completed_at SET NOT NULL,
  ALTER COLUMN result_counts SET NOT NULL;

COMMENT ON TABLE privacy_publication_reset_20260711 IS
  'Private audit ledger for the separate publication reset; never replayed automatically.';

ALTER TABLE users
  ALTER COLUMN is_public SET DEFAULT FALSE;

ALTER TABLE users
  ALTER COLUMN accepts_messages SET DEFAULT FALSE;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS profile_publication_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS profile_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS messaging_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS messaging_enabled_at TIMESTAMPTZ;

ALTER TABLE activity_feed
  ALTER COLUMN is_public SET DEFAULT FALSE;

ALTER TABLE collective_members
  ALTER COLUMN visibility SET DEFAULT 'private';

ALTER TABLE trade_reviews
  ALTER COLUMN is_public SET DEFAULT FALSE;

ALTER TABLE trade_reviews
  ADD COLUMN IF NOT EXISTS publication_notice_version TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

COMMENT ON COLUMN user_bounty_eligibility.phone_verified IS
  'Legacy self-submission flag without verification evidence. Runtime ignores it; the separate privacy reset clears legacy true values.';
