-- AlterTable BillingPlan
ALTER TABLE "BillingPlan" 
DROP COLUMN IF EXISTS "currentPeriodStart",
DROP COLUMN IF EXISTS "ordersUsed",
DROP COLUMN IF EXISTS "ordersLimit",
DROP COLUMN IF EXISTS "overageRate",
DROP COLUMN IF EXISTS "shopifyChargeId",
ADD COLUMN IF NOT EXISTS "monthlyPrice" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "usageCap" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "cap80AlertSent" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "cap90AlertSent" BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS "lastCapAlert" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "metadata" JSONB,
ALTER COLUMN "currentPeriodEnd" DROP NOT NULL,
ALTER COLUMN "priceMonthly" DROP NOT NULL;

-- Rename priceMonthly to monthlyPrice if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns 
             WHERE table_name = 'BillingPlan' 
             AND column_name = 'priceMonthly') THEN
    ALTER TABLE "BillingPlan" RENAME COLUMN "priceMonthly" TO "monthlyPrice";
  END IF;
END $$;

-- AlterTable UsageRecord
ALTER TABLE "UsageRecord" 
DROP COLUMN IF EXISTS "orderId",
DROP COLUMN IF EXISTS "orderNumber",
DROP COLUMN IF EXISTS "orderAmount",
ADD COLUMN IF NOT EXISTS "shopifyUsageRecordId" TEXT,
ADD COLUMN IF NOT EXISTS "description" TEXT,
ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS "currencyCode" TEXT DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS "idempotencyKey" TEXT,
ADD COLUMN IF NOT EXISTS "metadata" JSONB,
ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "billingPlanId" DROP NOT NULL;

-- Make amount required if it doesn't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'UsageRecord' 
                 AND column_name = 'amount' 
                 AND is_nullable = 'NO') THEN
    ALTER TABLE "UsageRecord" ALTER COLUMN "amount" SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'UsageRecord' 
                 AND column_name = 'description' 
                 AND is_nullable = 'NO') THEN
    ALTER TABLE "UsageRecord" ALTER COLUMN "description" SET NOT NULL;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'UsageRecord' 
                 AND column_name = 'idempotencyKey' 
                 AND is_nullable = 'NO') THEN
    ALTER TABLE "UsageRecord" ALTER COLUMN "idempotencyKey" SET NOT NULL;
  END IF;
END $$;

-- CreateTable BillingHistory
CREATE TABLE IF NOT EXISTS "BillingHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingPlanId" TEXT,

    CONSTRAINT "BillingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable Notification
CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BillingHistory_shop_createdAt_idx" ON "BillingHistory"("shop", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "BillingHistory_eventType_idx" ON "BillingHistory"("eventType");
CREATE INDEX IF NOT EXISTS "Notification_shop_read_idx" ON "Notification"("shop", "read");
CREATE INDEX IF NOT EXISTS "Notification_shop_createdAt_idx" ON "Notification"("shop", "createdAt" DESC);

-- Update UsageRecord indexes
DROP INDEX IF EXISTS "UsageRecord_shop_orderId_key";
CREATE INDEX IF NOT EXISTS "UsageRecord_shop_idempotencyKey_idx" ON "UsageRecord"("shop", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "BillingHistory" ADD CONSTRAINT "BillingHistory_billingPlanId_fkey" 
  FOREIGN KEY ("billingPlanId") REFERENCES "BillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;