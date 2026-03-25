-- Add missing widgetSecondaryTextColor column to ShopSettings
-- This was added to the Prisma schema but never migrated to the database
-- Nullable, no default (auto-derived from theme mode in application code)
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "widgetSecondaryTextColor" TEXT;
