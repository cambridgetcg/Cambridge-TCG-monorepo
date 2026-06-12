-- kingdom-090 follow-up: complete the trigram coverage for card search.
--
-- The /api/v1/prices q filter ORs three ILIKE '%q%' arms over
-- card_number, name, and name_en. 001_enable_trgm.sql indexed the first
-- two (plus sku) but name_en landed later (drizzle/0004) and was never
-- indexed — so Postgres cannot BitmapOr all three arms and falls back
-- toward a sequential scan of cards on every name search.
--
-- It also serves the typo-tolerant retry's `name_en % q` operator arm
-- (the % operator is GIN-trgm indexable; bare similarity() calls in a
-- WHERE are not — the retry uses % for exactly that reason). The
-- sort=relevance ORDER BY runs similarity() over already-filtered rows,
-- which needs no index.
--
-- Apply manually against the wholesale RDS (same channel as 001):
--   psql "$WHOLESALE_DATABASE_URL" -f apps/wholesale/infra/migrations/002_search_name_en_trgm.sql
-- CONCURRENTLY => safe on a live table; cannot run inside a transaction.

CREATE INDEX CONCURRENTLY IF NOT EXISTS cards_name_en_trgm_idx
  ON cards USING gin (name_en gin_trgm_ops);
