-- Task A19 review round 1 (Ruling 23: a new migration). When the merchant
-- dismissed the past-orders import's outcome on Home ("Done: N buyers placed
-- in tiers", or the failed-import sentence, with any import_error). Until
-- then the setup card stays open to show it, even once every other step is
-- done. The import runs once per connection, so one timestamp is enough.
-- Nullable, so older builds simply ignore it and an Instant Rollback stays
-- safe.
ALTER TABLE "connection" ADD COLUMN "import_dismissed_at" TIMESTAMP(3);
