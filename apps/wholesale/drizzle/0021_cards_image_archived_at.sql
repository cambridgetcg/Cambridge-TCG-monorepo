-- 0021: cards.image_archived_at — first-class marker for "have we copied
-- this card's image to durable S3 storage?". NULL = not yet (or last
-- attempt failed; see ingest_run.events for reason). NOT NULL = present
-- in the per-game bucket under hires/{set_code}/{sku}.jpg.
--
-- Companion: docs/superpowers/specs/2026-05-14-jp-pk-photos-hires-scrape-design.md
-- Driven by: Yu's 2026-05-14 directive to drain cardrush-pokemon → jp-pk-photos.
--
-- Note: 0020 was claimed (untracked, sister-shipped same day) by
-- 0020_sets_tcgdex_witness.sql for the TCGdex second-witness columns.
-- We take 0021 to avoid the collision; the work is otherwise unchanged
-- from the spec.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS image_archived_at timestamptz NULL;

-- Partial index: queries from the runner filter by game_id AND archive=NULL
-- AND image_url IS NOT NULL. The partial index keeps the batch SELECT fast
-- once most rows are archived (the alternative — a full index — would bloat
-- the table without serving any other query).
CREATE INDEX IF NOT EXISTS cards_image_archive_pending_idx
  ON cards (game_id, id)
  WHERE image_archived_at IS NULL AND image_url IS NOT NULL;
