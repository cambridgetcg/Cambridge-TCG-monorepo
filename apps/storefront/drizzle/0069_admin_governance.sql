-- Admin governance audit trail.
--
-- Every consequential admin action — suspend a user, override a trust
-- score, hide a review, force-resolve a dispute, dismiss a fraud
-- signal — should leave a record. Pattern matches every other lifecycle
-- log we've shipped: append-only, action enum, before/after for
-- mutating ops, free-form reason for support context.
--
-- Without this, post-hoc questions like "why was this user suspended
-- on the 14th?" require diff'ing nightly DB snapshots. After this,
-- one query.

BEGIN;

CREATE TABLE IF NOT EXISTS admin_actions_log (
  id              BIGSERIAL PRIMARY KEY,

  -- Admin identity is best-effort: the password-cookie auth doesn't
  -- map to a user_id today, so this is a free-form label set by the
  -- caller (typically the admin's email from a future session). NULL
  -- when the action is system-driven (auto-suspend from fraud cron).
  actor_label     TEXT,

  -- The thing being acted on. user_id for suspensions/overrides;
  -- target_kind+target_id pair for non-user targets (e.g.
  -- 'fraud_signal' + signal id, 'review' + review id).
  target_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
  target_kind     VARCHAR(30) NOT NULL,
  target_id       TEXT,

  -- Action taken — free-form per surface. Examples:
  --   user.suspend, user.unsuspend, user.trust_override
  --   fraud.resolve, fraud.escalate, fraud.dismiss
  --   review.hide, review.unhide
  --   dispute.force_resolve
  action          VARCHAR(60) NOT NULL,

  -- before/after state for mutating ops, captured as JSONB so the
  -- governance UI can render a diff. NULL for non-mutating actions.
  before_value    JSONB,
  after_value     JSONB,

  -- Operator context — required for any consequential action so the
  -- governance log isn't a stream of mysteries.
  reason          TEXT,
  metadata        JSONB,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_log_target_user
  ON admin_actions_log(target_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_log_action
  ON admin_actions_log(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_actions_log_recent
  ON admin_actions_log(created_at DESC);

-- Add a `notified_at` column on fraud_signals so the auto-suspend
-- gate can de-dup escalations (don't re-suspend a user every cron tick
-- if their high-severity signal stays unresolved).
ALTER TABLE fraud_signals
  ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_fraud_signals_unresolved_severity
  ON fraud_signals(user_id, severity, created_at DESC)
  WHERE resolved = false;

COMMIT;
