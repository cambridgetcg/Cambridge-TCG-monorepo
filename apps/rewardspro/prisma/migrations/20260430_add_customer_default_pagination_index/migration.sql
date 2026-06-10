-- Adds an index for the default members-page pagination query:
--   SELECT ... FROM "Customer" WHERE shop = $1 ORDER BY "createdAt" DESC LIMIT 25 OFFSET ?
-- Without this, default-sort pagination (no tier filter) falls back to the
-- single-column @@index([shop]) and Postgres has to sort the matching rows.
-- With the new index, the read is index-only and bounded by LIMIT.
--
-- CONCURRENTLY → no exclusive lock; safe to run on a live table.
-- IF NOT EXISTS → idempotent for re-runs / partial failures.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Customer_shop_createdAt_idx"
  ON "Customer" ("shop", "createdAt" DESC);
