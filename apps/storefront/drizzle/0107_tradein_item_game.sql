-- Multi-game trade-in: record which game each submitted item belongs to.
-- Default 'one-piece' backfills all pre-existing rows (the buylist was
-- One Piece-only until this point).
ALTER TABLE tradein_items
  ADD COLUMN IF NOT EXISTS game VARCHAR(20) NOT NULL DEFAULT 'one-piece';
