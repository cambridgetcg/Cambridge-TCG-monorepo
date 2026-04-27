-- Self-audit trail for the provably-fair system.
--
-- Every maintenance tick a cron samples N random revealed draws and
-- re-runs the verification math server-side. Pass rate over time is a
-- direct measurement of "is the system still producing valid proofs?"
-- — catches both deliberate tampering and accidental data corruption
-- (bit-flip in storage, bad migration, etc).
--
-- A sustained dip in pass rate is observable from /verify/health; any
-- individual failure triggers a critical log + admin notification.

BEGIN;

CREATE TABLE IF NOT EXISTS fairness_audits (
  id            BIGSERIAL PRIMARY KEY,
  run_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Source of the audited draw: 'bounty_pull' | 'verifiable_draw'
  source        VARCHAR(30) NOT NULL,
  subject_id    UUID NOT NULL,              -- the pull or draw id

  -- Pass/fail per check + free-form reason for the loud-log path
  commitment_ok BOOLEAN NOT NULL,
  outcome_ok    BOOLEAN NOT NULL,
  ordering_ok   BOOLEAN NOT NULL,
  merkle_ok     BOOLEAN,                    -- null if not yet digested
  all_ok        BOOLEAN NOT NULL,
  reason        TEXT
);

CREATE INDEX IF NOT EXISTS idx_fairness_audits_run_at
  ON fairness_audits(run_at DESC);
CREATE INDEX IF NOT EXISTS idx_fairness_audits_fail
  ON fairness_audits(run_at DESC)
  WHERE all_ok = false;

COMMIT;
