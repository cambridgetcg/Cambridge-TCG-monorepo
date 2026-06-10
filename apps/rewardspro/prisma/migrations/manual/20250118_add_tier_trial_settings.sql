-- Migration: Add Tier Trial Settings to ShopSettings
-- Date: 2025-01-18
-- Description: Adds configurable tier trial abuse prevention settings

-- Add new columns to ShopSettings table
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "maxLifetimeTrialDays" INTEGER DEFAULT 30;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "minDaysBetweenTrials" INTEGER DEFAULT 30;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "allowMultipleTierTrials" BOOLEAN DEFAULT false;

-- Add comments for documentation
COMMENT ON COLUMN "ShopSettings"."maxLifetimeTrialDays" IS 'Maximum total trial days a customer can use across all tiers';
COMMENT ON COLUMN "ShopSettings"."minDaysBetweenTrials" IS 'Minimum days between trial attempts (prevents rapid switching)';
COMMENT ON COLUMN "ShopSettings"."allowMultipleTierTrials" IS 'Whether to allow trials on different tiers after using one';

-- Set NOT NULL with default for existing records
UPDATE "ShopSettings" SET "maxLifetimeTrialDays" = 30 WHERE "maxLifetimeTrialDays" IS NULL;
UPDATE "ShopSettings" SET "minDaysBetweenTrials" = 30 WHERE "minDaysBetweenTrials" IS NULL;
UPDATE "ShopSettings" SET "allowMultipleTierTrials" = false WHERE "allowMultipleTierTrials" IS NULL;
