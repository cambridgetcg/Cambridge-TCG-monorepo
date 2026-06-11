-- Migration: Add Review Banner Fields to ShopSettings
-- Date: 2026-03-08
-- Description: Tracks whether a merchant has dismissed the in-app review request banner
--              and whether they have clicked "I've left my review"

ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "reviewBannerDismissed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "reviewClickedAt" TIMESTAMP(3);

COMMENT ON COLUMN "ShopSettings"."reviewBannerDismissed" IS 'Whether the merchant has dismissed the review request banner';
COMMENT ON COLUMN "ShopSettings"."reviewClickedAt" IS 'Timestamp when merchant confirmed they left a review';
