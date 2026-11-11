-- RP-25, #195 (Ruling 23: a new migration, the merged ones untouched). A
-- refund of money with no items whose money was still on its way when it
-- was recorded is marked (money_pending_since). The hourly payout check
-- reads it again, least recently read first (money_checked_at), until its
-- money succeeds or fails, or 30 days pass, and only then takes its
-- cashback back. Additive and nullable: older builds never write or read
-- these columns, and an Instant Rollback stays safe (a refund recorded by
-- older code is simply not marked, as today). Apply it to production before
-- the code that reads it deploys: Prisma reads every refund column on a
-- query without a select. No backfill.
-- AlterTable
ALTER TABLE "refund" ADD COLUMN     "money_checked_at" TIMESTAMP(3),
ADD COLUMN     "money_pending_since" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "refund_money_pending_since_idx" ON "refund"("money_pending_since");
