-- RP-24 (the first-time setup guide; Ruling 23: a new migration). When the
-- merchant pressed "Finish later" in the guide: the first open no longer
-- sends them to it. Nullable, so older builds simply ignore it and an
-- Instant Rollback stays safe.
ALTER TABLE "merchant" ADD COLUMN "guide_dismissed_at" TIMESTAMP(3);
