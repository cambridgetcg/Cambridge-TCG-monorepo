-- Track when each recurring digest last ran. Used as an atomic claim
-- table so the cron can call the sender every minute safely — the
-- conditional UPDATE only succeeds once per interval.

BEGIN;

CREATE TABLE IF NOT EXISTS digest_runs (
  kind         VARCHAR(50) PRIMARY KEY,
  last_run_at  TIMESTAMPTZ,
  last_sent    INT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
