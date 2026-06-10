-- Migration 0022 — games.code joins the kingdom (kingdom-039).
--
-- The live games table held legacy long codes seeded by src/lib/db/seed.ts
-- ('onepiece', 'pokemon', 'yugioh', 'dragonball') while everything built
-- since the consolidation keys on @cambridge-tcg/sku GameCodes ('op',
-- 'pkm', 'ygo', 'dbf'). The drift broke production silently:
--
--   - cardrush discovery cron skipped all 6 subdomains nightly
--     ("unknown game code: op") — zero new cards discovered since cutover
--   - cardrush-hires cron crash-looped every 5 minutes
--     ("game code not found: pkm")
--   - seed-rarity-map / seed-classifications-from-cards resolved no games
--
-- cardrush-discovery.ts:292-293 declares the invariant this migration
-- restores: "The cardrush registry's GameCode values match wholesale
-- games.code values."
--
-- The Dragon Ball decision: the legacy 'dragonball' row's inventory is
-- FB01-FB08 / SB01-SB02 — Fusion World sets — so it becomes 'dbf', not
-- 'dbs'. The data-ingest registry's cardrush-db.jp entry moves from
-- 'dbs' to 'dbf' in the same deploy (packages/data-ingest/src/cardrush/
-- index.ts), as do the hires-upload game keys.
--
-- Slugs are deliberately untouched: all storefront page traffic and
-- trade-in pricing resolve games by slug ('one-piece', 'pokemon', ...),
-- and the public API resolves `code OR slug` — so URL surfaces survive.
--
-- Idempotent: each UPDATE keys on the legacy value and is a no-op once
-- flipped. A fresh DB seeded by the post-flip seed.ts matches already.

UPDATE games SET code = 'op'  WHERE code = 'onepiece';
UPDATE games SET code = 'pkm' WHERE code = 'pokemon';
UPDATE games SET code = 'ygo' WHERE code = 'yugioh';
UPDATE games SET code = 'dbf' WHERE code = 'dragonball';

-- ── cards.last_scrape_attempt_at — the chunked-ingest cursor ────────────
--
-- The revived price ingest works through the watch-list in stalest-first
-- chunks sized to Vercel's 800s budget. cards.last_synced_at only
-- advances on a SUCCESSFUL scrape, so permanently-failing cards (dead
-- URLs, WAF-blocked hosts) would pin themselves to the front of the
-- queue and starve everything behind them. This column advances on every
-- ATTEMPT, making the cursor monotone regardless of outcome. NULL means
-- "never attempted by the chunked ingest" and sorts first.

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS last_scrape_attempt_at timestamptz;

-- The chunk SELECT's path: WHERE game_id IN (...) AND cardrush_url IS NOT
-- NULL ORDER BY last_scrape_attempt_at ASC NULLS FIRST LIMIT n.
CREATE INDEX IF NOT EXISTS cards_scrape_attempt_cursor_idx
  ON cards (last_scrape_attempt_at ASC NULLS FIRST)
  WHERE cardrush_url IS NOT NULL;
