-- Milestone 2 review, part c (Ruling 23: a new migration, the merged ones
-- untouched). Two nullable or defaulted columns on connection, so older
-- builds simply ignore them and an Instant Rollback stays safe:
-- - last_swept_at (OPERATIONS-6): when the hourly sweep last finished this
--   store; the sweep walks the stores least recently swept first, so a run
--   cut short by its deadline reaches the others next hour.
-- - import_file_refusals (Ruling 48): polls in a row whose bulk file URL
--   answered 4xx; the second ends that bulk query's attempt.
ALTER TABLE "connection" ADD COLUMN "last_swept_at" TIMESTAMP(3);
ALTER TABLE "connection" ADD COLUMN "import_file_refusals" INTEGER NOT NULL DEFAULT 0;
