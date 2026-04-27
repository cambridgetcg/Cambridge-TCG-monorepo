-- Prize fulfilment parity with vault redemption.
--
-- The prize pipeline (raffles / mystery boxes / packs) had the core
-- shipping columns (address, tracking_number, shipped_at) from 0048
-- but lacked: carrier enum, fulfilment audit log, and an atomic undo
-- path. Vault redemption got all three on the bounty side; mirror
-- here so physical-prize ops has the same safety net.

BEGIN;

-- ── carrier column on each prize table ────────────────────────────
-- Mirrors the customer_orders.carrier column added in 0055 so prize
-- emails can render clickable carrier-aware tracking links via the
-- same @/lib/shipping/carriers helper.

ALTER TABLE raffles             ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);
ALTER TABLE mystery_box_opens   ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);
ALTER TABLE pack_opens          ADD COLUMN IF NOT EXISTS carrier VARCHAR(50);


-- ── prize fulfilment audit log ────────────────────────────────────
-- Append-only lifecycle trail. Every ship / undone / errored
-- transition writes a row so support can answer "when was this
-- shipped, and why did tracking change?" without diff'ing backups.
-- Parallel to vault_fulfilment_log from 0056.

CREATE TABLE IF NOT EXISTS prize_fulfilment_log (
  id              BIGSERIAL PRIMARY KEY,
  -- 'raffle' | 'mystery_box' | 'pack'
  prize_kind      VARCHAR(20) NOT NULL,
  -- The prize's id on its kind-specific table (raffles.id, mystery_
  -- box_opens.id, pack_opens.id). Stored as text so one table spans
  -- all three (raffles uses UUID, the others use int; we unify via
  -- string).
  prize_id        TEXT NOT NULL,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  -- 'shipped' | 'undone' | 'errored' | 'address_updated'
  action          VARCHAR(20) NOT NULL,
  -- Kept as text for flexibility; the admin handler stringifies a
  -- small context blob (carrier, tracking, prev values).
  notes           TEXT,
  metadata        JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prize_fulfilment_log_subject
  ON prize_fulfilment_log(prize_kind, prize_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_prize_fulfilment_log_action
  ON prize_fulfilment_log(action, created_at DESC);


-- ── naming parity ─────────────────────────────────────────────────
-- Raffles uses `prize_fulfilled`; the other two use `fulfilled`. Rather
-- than rename (breaks the raffle_draw_proofs surface + admin queue
-- joins in prod), add a `fulfilled` generated column on raffles that
-- aliases prize_fulfilled for read-time consistency. Writers continue
-- to touch prize_fulfilled; readers can use either name.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_name = 'raffles' AND column_name = 'fulfilled'
  ) THEN
    ALTER TABLE raffles
      ADD COLUMN fulfilled BOOLEAN GENERATED ALWAYS AS (prize_fulfilled) STORED;
  END IF;
END $$;

COMMIT;
