-- Mark PVE wins whose reward grants completed. Without this column, a
-- victory that crashes between the status flip and the reward grants
-- looks identical to one that completed cleanly — there's no way for a
-- reconciliation sweep to recover lost rewards.

BEGIN;

ALTER TABLE pve_games
  ADD COLUMN IF NOT EXISTS awarded_at TIMESTAMPTZ;

-- Backfill: any existing won games are assumed to have been awarded
-- (they're in production already; we don't want to re-grant retroactively).
UPDATE pve_games
   SET awarded_at = COALESCE(ended_at, NOW())
 WHERE status = 'won' AND awarded_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pve_games_awarded_recovery
  ON pve_games(status, awarded_at)
  WHERE status = 'won' AND awarded_at IS NULL;

COMMIT;
