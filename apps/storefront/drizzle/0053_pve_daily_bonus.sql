-- Daily PVE bonus pull token. The first PVE win each UTC day grants the
-- user one free common pull token. Idempotency is enforced by a
-- composite PK on (user_id, bonus_date) — a duplicate insert from
-- a same-day second win or a sweep replay simply no-ops.

BEGIN;

CREATE TABLE IF NOT EXISTS pve_daily_bonuses (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  bonus_date   DATE NOT NULL,
  tier_granted VARCHAR(20) NOT NULL DEFAULT 'common',
  game_id      UUID,
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, bonus_date)
);

CREATE INDEX IF NOT EXISTS idx_pve_daily_bonuses_date
  ON pve_daily_bonuses(bonus_date DESC);

COMMIT;
