-- Review lifecycle audit + appeal columns.
--
-- trade_reviews has admin_hidden + flagged from 0019, but no record of
-- WHO hid it, WHY, or WHEN — same gap I closed for vault_items, prizes,
-- and admin actions earlier in the session. Append-only log mirrors
-- the now-canonical lifecycle pattern; one row per submit / hide /
-- unhide / appealed / dismissed transition.

BEGIN;

CREATE TABLE IF NOT EXISTS review_lifecycle_log (
  id          BIGSERIAL PRIMARY KEY,
  review_id   UUID NOT NULL REFERENCES trade_reviews(id) ON DELETE CASCADE,
  -- 'submitted' | 'hidden' | 'unhidden' | 'flagged' | 'appealed' | 'appeal_dismissed' | 'edited'
  action      VARCHAR(30) NOT NULL,
  -- For admin-triggered actions, mirror the governance log's actor_label.
  -- For user-triggered actions (submit, appeal), the user's id.
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_label TEXT,
  reason      TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_log_review
  ON review_lifecycle_log(review_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_log_action
  ON review_lifecycle_log(action, created_at DESC);

-- Appeal columns on the review row itself so a queue can show
-- "appealed" without joining the log.
ALTER TABLE trade_reviews
  ADD COLUMN IF NOT EXISTS appealed_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS appeal_reason    TEXT,
  ADD COLUMN IF NOT EXISTS appeal_resolved  BOOLEAN NOT NULL DEFAULT false,
  -- The trust-tier-weighted contribution this review made at last
  -- recompute. Lets the score-breakdown show "this review counted as
  -- 0.5x because reviewer was new-tier" without re-running engine math.
  ADD COLUMN IF NOT EXISTS effective_weight NUMERIC(3,2);

CREATE INDEX IF NOT EXISTS idx_reviews_appealed
  ON trade_reviews(appealed_at DESC)
  WHERE appealed_at IS NOT NULL AND appeal_resolved = false;

COMMIT;
