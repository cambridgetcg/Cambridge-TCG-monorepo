-- Trust score evolution timeseries.
--
-- trust_profiles.trust_score is the current value but has no history —
-- we can't see "your score dropped after dispute X" or "tier changes
-- per week" without snapshotting. The daily recompute cron writes one
-- row per (user, UTC day) so support and the public profile can plot
-- evolution.
--
-- Composite PK on (user_id, snapshot_date) is the de-dup gate: a
-- multi-tick re-run of the cron on the same UTC day no-ops via
-- ON CONFLICT.

BEGIN;

CREATE TABLE IF NOT EXISTS trust_score_history (
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date     DATE NOT NULL,
  trust_score       INT NOT NULL,
  total_trades      INT NOT NULL DEFAULT 0,
  completed_trades  INT NOT NULL DEFAULT 0,
  disputes_won      INT NOT NULL DEFAULT 0,
  disputes_lost     INT NOT NULL DEFAULT 0,
  avg_rating        NUMERIC(3,2),
  recorded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_trust_history_date
  ON trust_score_history(snapshot_date DESC);

COMMIT;
