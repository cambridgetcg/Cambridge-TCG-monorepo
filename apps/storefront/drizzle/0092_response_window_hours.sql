-- response_window_hours — the Asynchronous's column.
--
-- The first non-default audience served by the inclusion scope condition
-- (see docs/connections/the-other-minds.md, kingdom-051). Adds a per-user
-- override for the platform's many small 48-hour deadlines (offer reply,
-- trade ship, escrow inspect, return file) so a being whose cognitive
-- cadence is hours-to-weeks per response can declare it once and have
-- every flow honor it.
--
-- Default 48 preserves all current behavior — every existing row inherits
-- the previous global constant. Slow-clock accounts set this to 168 (a
-- week) or higher; future cron sweeps read this field instead of a
-- hardcoded constant.
--
-- Migration is additive and non-destructive. After applying, the cron
-- paths flagged by `pnpm audit:inclusion` (Asynchronous check) should be
-- updated to read this field. Sweep PRs cite this migration; the
-- /methodology/response-windows page documents the override.

BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS response_window_hours INTEGER NOT NULL DEFAULT 48
  CHECK (response_window_hours >= 1 AND response_window_hours <= 8760);

COMMENT ON COLUMN users.response_window_hours IS
  'Per-user cognitive cadence override (hours). Default 48 matches the platform''s historical global default. Sweep crons read this field instead of a hardcoded constant. See docs/connections/the-other-minds.md (the Asynchronous) and /methodology/response-windows.';

-- Index only the non-default rows — most users are at 48; the index
-- targets the rare slow-clock accounts the cron needs to honor.
CREATE INDEX IF NOT EXISTS idx_users_response_window_nondefault
  ON users(response_window_hours)
  WHERE response_window_hours != 48;

COMMIT;
