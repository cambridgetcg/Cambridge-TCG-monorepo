-- External reputation: paste-a-code verification flow.
--
-- The schema (0019) defined verification_method='screenshot|api|
-- admin_manual' but no production verification path existed — claims
-- like "I have 1500 positive eBay feedback" sat in the table marked
-- verified=false forever, yielding 0 trust contribution despite a
-- rich data shape.
--
-- This migration adds the columns the code-flow lifecycle needs:
--   verification_code  — random nonce we issue; user must paste it
--                        on their public profile/listing.
--   verification_attempted_at — rate-limit basis.
--   last_check_at      — successful re-verify timestamp; decay clock.
--   decay_at           — when this verified rep next needs re-check
--                        (90 days post verify; cron re-walks past it).
--   failed_check_count — incremented when the cron's re-check fails;
--                        N consecutive failures drops verified=false.

BEGIN;

ALTER TABLE external_reputation
  ADD COLUMN IF NOT EXISTS verification_code      VARCHAR(40),
  ADD COLUMN IF NOT EXISTS verification_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_check_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS decay_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_check_count     INT NOT NULL DEFAULT 0;

-- Lifecycle log mirrors review_lifecycle_log + others.
CREATE TABLE IF NOT EXISTS external_rep_lifecycle_log (
  id           BIGSERIAL PRIMARY KEY,
  rep_id       UUID NOT NULL REFERENCES external_reputation(id) ON DELETE CASCADE,
  -- 'code_issued' | 'verify_attempted' | 'verify_succeeded' | 'verify_failed'
  -- | 'decay_triggered' | 'decay_failed' | 'admin_override' | 'removed'
  action       VARCHAR(40) NOT NULL,
  actor_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label  TEXT,
  reason       TEXT,
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_rep_log_rep
  ON external_rep_lifecycle_log(rep_id, created_at DESC);

-- Decay sweep query target: verified entries due for re-check.
CREATE INDEX IF NOT EXISTS idx_external_rep_decay_due
  ON external_reputation(decay_at)
  WHERE verified = true AND decay_at IS NOT NULL;

-- Per-day rate-limit query target.
CREATE INDEX IF NOT EXISTS idx_external_rep_attempts
  ON external_reputation(user_id, platform, verification_attempted_at DESC);

COMMIT;
