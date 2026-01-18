-- Migration: Add Enhanced Icon System to PointsConfig
-- Date: 2025-01-18
-- Description: Adds fields for enhanced icon configuration (emoji, upload, library modes)

-- Add new columns to PointsConfig table
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "currencyIconType" VARCHAR(20) DEFAULT 'emoji';
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "currencyIconUrl" TEXT;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "currencyIconId" VARCHAR(100);
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "currencyIconColor" VARCHAR(20);

-- Add comments for documentation
COMMENT ON COLUMN "PointsConfig"."currencyIconType" IS 'Type of icon: emoji, upload, or library';
COMMENT ON COLUMN "PointsConfig"."currencyIconUrl" IS 'URL for uploaded custom icon (SVG/PNG)';
COMMENT ON COLUMN "PointsConfig"."currencyIconId" IS 'ID for icon library selection (e.g., lucide:star)';
COMMENT ON COLUMN "PointsConfig"."currencyIconColor" IS 'Hex color for library icons (e.g., #5C6AC4)';

-- Update existing records to use default emoji type
UPDATE "PointsConfig" SET "currencyIconType" = 'emoji' WHERE "currencyIconType" IS NULL;
