-- Migration 0020 — TCGdex second-witness columns on `sets`.
--
-- Adds parallel `tcgdex_*` columns to the `sets` table. CardRush remains
-- the *market-reality witness* (operator-curated `name`, `release_date`).
-- TCGdex (https://api.tcgdex.net/v2/{lang}/sets/{id}) becomes the
-- *metadata-correctness witness*. They are NOT unified — the columns sit
-- side by side and the audit `pnpm audit:tcgdex-drift` reports
-- disagreements as findings.
--
-- Why two witnesses, not one: today's KNOWN_SET_NAMES map carries some
-- pre-release rumour names (e.g. SV11B = "ガイアクライシス" — TCGdex
-- says "ブラックボルト" / Black Bolt, which is the actual 2025 release).
-- A single source can't catch that kind of drift. Two sources + an audit
-- can.
--
-- Designed in `docs/connections/the-second-witness.md` (kingdom-NNN,
-- 2026-05-14). All columns nullable — backfill happens via the cardrush
-- discovery cron's `ensureSetRow` path (one TCGdex GET per new set on
-- creation) and a one-shot reconcile run from the admin route.
--
-- Additive only. No backfill needed before going live; rows fill in over
-- time as discovery runs.

ALTER TABLE sets
  ADD COLUMN IF NOT EXISTS tcgdex_id            text,
  ADD COLUMN IF NOT EXISTS tcgdex_name          text,
  ADD COLUMN IF NOT EXISTS tcgdex_serie_name    text,
  ADD COLUMN IF NOT EXISTS tcgdex_logo_url      text,
  ADD COLUMN IF NOT EXISTS tcgdex_release_date  text,
  ADD COLUMN IF NOT EXISTS tcgdex_card_count    integer,
  ADD COLUMN IF NOT EXISTS tcgdex_fetched_at    timestamptz;

-- Index for the audit's primary scan: "sets where tcgdex says one thing
-- and our name says another" — small table (~hundreds of rows per game)
-- so the index is light. We index on `tcgdex_fetched_at IS NULL` via a
-- partial index so the audit's "not yet enriched" check is also fast.

CREATE INDEX IF NOT EXISTS sets_tcgdex_unenriched_idx
  ON sets (game_id, code)
  WHERE tcgdex_fetched_at IS NULL;
