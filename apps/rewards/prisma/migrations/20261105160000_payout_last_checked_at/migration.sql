-- Task A15 (Ruling 23): when the hourly payout check last looked at an
-- unclear payout (it read the buyer's credit history, or the store could not
-- be reached). The check reads at most 20 histories a run, least recently
-- checked first, so payouts it can't settle yet don't keep the others waiting
-- (carried from apps/rewardspro's lastCheckedAt, which lived in metadata).
ALTER TABLE "payout" ADD COLUMN "last_checked_at" TIMESTAMP(3);
