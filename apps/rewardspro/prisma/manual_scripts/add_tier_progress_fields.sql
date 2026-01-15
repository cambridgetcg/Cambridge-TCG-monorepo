-- Migration: Add pre-computed tier progress fields to CustomerTierState
-- Description: Enables widget to display progress without runtime calculations
-- Date: 2025-12-20

-- Add progress tracking fields
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "progressPercent" INTEGER DEFAULT 0;
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierId" TEXT;
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierName" TEXT;
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "nextTierMinSpend" DECIMAL(10, 2);
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "amountToNextTier" DECIMAL(10, 2) DEFAULT 0;
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "isMaxTier" BOOLEAN DEFAULT false;
ALTER TABLE "CustomerTierState" ADD COLUMN IF NOT EXISTS "progressCalculatedAt" TIMESTAMP;

-- Add foreign key constraint for nextTierId
ALTER TABLE "CustomerTierState"
ADD CONSTRAINT "CustomerTierState_nextTierId_fkey"
FOREIGN KEY ("nextTierId")
REFERENCES "Tier"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Create index for isMaxTier queries
CREATE INDEX IF NOT EXISTS "CustomerTierState_isMaxTier_idx" ON "CustomerTierState"("isMaxTier");

-- Create index for nextTierId lookups
CREATE INDEX IF NOT EXISTS "CustomerTierState_nextTierId_idx" ON "CustomerTierState"("nextTierId");
