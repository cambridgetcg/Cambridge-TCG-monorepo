-- CreateEnum
CREATE TYPE "public"."TierChangeType" AS ENUM ('INITIAL_ASSIGNMENT', 'UPGRADE', 'DOWNGRADE');

-- CreateEnum
CREATE TYPE "public"."TierTriggerType" AS ENUM ('ACCOUNT_CREATED', 'PERIODIC_REVIEW', 'SPENDING_MILESTONE', 'MANUAL_ADMIN');

-- AlterTable
ALTER TABLE "public"."Customer" ADD COLUMN     "currentTierId" TEXT;

-- CreateTable
CREATE TABLE "public"."TierChangeLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "fromTierId" TEXT,
    "fromTierName" TEXT,
    "toTierId" TEXT,
    "toTierName" TEXT,
    "changeType" "public"."TierChangeType" NOT NULL,
    "triggerType" "public"."TierTriggerType" NOT NULL,
    "totalSpending" DECIMAL(10,2),
    "periodSpending" DECIMAL(10,2),
    "orderId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedBy" TEXT,

    CONSTRAINT "TierChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TierChangeLog_customerId_createdAt_idx" ON "public"."TierChangeLog"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_shop_createdAt_idx" ON "public"."TierChangeLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_changeType_idx" ON "public"."TierChangeLog"("changeType");

-- CreateIndex
CREATE INDEX "TierChangeLog_triggerType_idx" ON "public"."TierChangeLog"("triggerType");

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_currentTierId_fkey" FOREIGN KEY ("currentTierId") REFERENCES "public"."Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TierChangeLog" ADD CONSTRAINT "TierChangeLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
