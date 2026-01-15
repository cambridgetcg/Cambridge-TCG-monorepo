-- Migration: Add manualOverrideTierId to CustomerTierState
-- Description: Stores the tier ID that was manually set, preventing bugs when currentTierId changes
-- Date: 2025-12-20

-- Add the new column
ALTER TABLE "CustomerTierState" ADD COLUMN "manualOverrideTierId" TEXT;

-- Add foreign key constraint
ALTER TABLE "CustomerTierState"
ADD CONSTRAINT "CustomerTierState_manualOverrideTierId_fkey"
FOREIGN KEY ("manualOverrideTierId")
REFERENCES "Tier"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

-- Create index for faster lookups
CREATE INDEX "CustomerTierState_manualOverrideTierId_idx" ON "CustomerTierState"("manualOverrideTierId");

-- Backfill existing manual overrides with the tier they were assigned
-- This updates records where hasManualOverride is true but manualOverrideTierId is null
UPDATE "CustomerTierState" cts
SET "manualOverrideTierId" = cts."effectiveTierId"
WHERE cts."hasManualOverride" = true
  AND cts."manualOverrideTierId" IS NULL
  AND cts."effectiveTierId" IS NOT NULL;
