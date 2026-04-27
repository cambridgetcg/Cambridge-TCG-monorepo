-- Admin-facing fairness drift alerts.
--
-- The public /verify/fairness dashboard shows per-tier χ² for anyone
-- to eyeball. But admins need a PROACTIVE signal — they shouldn't have
-- to remember to check the page. The daily drift cron computes χ² per
-- (kind, group) over a rolling window; when the score crosses the
-- threshold with enough samples, a row lands here and an email fires.
--
-- Idempotent per (alert_date UTC, kind_group) so a re-run of the cron
-- for the same day doesn't double-alert.

BEGIN;

CREATE TABLE IF NOT EXISTS fairness_alerts (
  id               BIGSERIAL PRIMARY KEY,
  alert_date       DATE NOT NULL,
  kind_group       VARCHAR(100) NOT NULL,   -- e.g. 'bounty_pull.uncommon' | 'pack_open'
  chi_square       NUMERIC(10, 2) NOT NULL,
  sample_size      INT NOT NULL,
  window_days      INT NOT NULL,
  threshold        NUMERIC(10, 2) NOT NULL,
  summary          TEXT,                     -- human-readable recap for the email body
  raised_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at  TIMESTAMPTZ,
  acknowledged_by  TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fairness_alerts_unique_day_group
  ON fairness_alerts(alert_date, kind_group);
CREATE INDEX IF NOT EXISTS idx_fairness_alerts_open
  ON fairness_alerts(raised_at DESC)
  WHERE acknowledged_at IS NULL;

COMMIT;
