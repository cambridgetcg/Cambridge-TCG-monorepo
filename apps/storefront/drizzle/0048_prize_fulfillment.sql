-- Physical prize fulfillment workflow.
--
-- Adds shipping fields + tracking columns to raffle (winner-side) and
-- mystery box / pack opens. Customer enters address; admin marks as
-- shipped with a tracking number. Same lifecycle for all three reward
-- types so the admin queue is unified.

BEGIN;

-- Raffles already have prize_fulfilled boolean; extend with the workflow
ALTER TABLE raffles
  ADD COLUMN IF NOT EXISTS shipping_address    TEXT,
  ADD COLUMN IF NOT EXISTS shipping_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_number     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ;

ALTER TABLE mystery_box_opens
  ADD COLUMN IF NOT EXISTS shipping_address    TEXT,
  ADD COLUMN IF NOT EXISTS shipping_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_number     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ;

ALTER TABLE pack_opens
  ADD COLUMN IF NOT EXISTS shipping_address    TEXT,
  ADD COLUMN IF NOT EXISTS shipping_collected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_number     VARCHAR(100),
  ADD COLUMN IF NOT EXISTS shipped_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fulfilled           BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_raffles_unfulfilled
  ON raffles(prize_fulfilled, shipped_at)
  WHERE winner_user_id IS NOT NULL AND prize_fulfilled = false;

CREATE INDEX IF NOT EXISTS idx_mystery_unfulfilled
  ON mystery_box_opens(fulfilled)
  WHERE fulfilled = false;

CREATE INDEX IF NOT EXISTS idx_pack_unfulfilled
  ON pack_opens(fulfilled)
  WHERE fulfilled = false;

COMMIT;
