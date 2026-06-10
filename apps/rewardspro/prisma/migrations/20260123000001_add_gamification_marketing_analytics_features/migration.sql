-- Migration: Add gamification, marketing, and analytics feature flags to ShopEntitlements
-- P2: Gamification features and limits
-- P3: Marketing features and limits
-- P4: Analytics features

-- ============================================
-- P2: Gamification features
-- ============================================

-- Raffles feature (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureRaffles" BOOLEAN NOT NULL DEFAULT false;

-- Mystery Boxes feature (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureMysteryBoxes" BOOLEAN NOT NULL DEFAULT false;

-- Challenges feature (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureChallenges" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- P3: Marketing features
-- ============================================

-- Marketing Campaigns feature (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureMarketingCampaigns" BOOLEAN NOT NULL DEFAULT false;

-- Marketing Automation feature (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureMarketingAutomation" BOOLEAN NOT NULL DEFAULT false;

-- AI Recommendations feature (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureAiRecommendations" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- P4: Analytics features
-- ============================================

-- RFM Segmentation feature (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureRfmSegmentation" BOOLEAN NOT NULL DEFAULT false;

-- Program Impact Analytics feature (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureProgramImpact" BOOLEAN NOT NULL DEFAULT false;

-- Realtime Analytics feature (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureRealtimeAnalytics" BOOLEAN NOT NULL DEFAULT false;

-- Cohort Analysis feature (Ultra)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureCohortAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- P2: Gamification limits
-- ============================================

-- Max active raffles (Free: 0, Pro: 2, Max: 10, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxActiveRaffles" INTEGER NOT NULL DEFAULT 0;

-- Max active mystery boxes (Free: 0, Pro: 0, Max: 5, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxActiveMysteryBoxes" INTEGER NOT NULL DEFAULT 0;

-- Max active challenges (Free: 0, Pro: 3, Max: 15, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxActiveChallenges" INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- P3: Marketing limits
-- ============================================

-- Max campaigns (Free: 0, Pro: 5, Max: 25, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxCampaigns" INTEGER NOT NULL DEFAULT 0;

-- Max automation flows (Free: 0, Pro: 0, Max: 10, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxAutomationFlows" INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- Update existing records based on current plan
-- ============================================

-- Update Pro plans: Enable Pro-tier features
UPDATE "ShopEntitlements"
SET
  "featureRaffles" = true,
  "featureMysteryBoxes" = false,
  "featureChallenges" = true,
  "featureMarketingCampaigns" = true,
  "featureMarketingAutomation" = false,
  "featureAiRecommendations" = false,
  "featureRfmSegmentation" = false,
  "featureProgramImpact" = true,
  "featureRealtimeAnalytics" = false,
  "featureCohortAnalysis" = false,
  "limitMaxActiveRaffles" = 2,
  "limitMaxActiveMysteryBoxes" = 0,
  "limitMaxActiveChallenges" = 3,
  "limitMaxCampaigns" = 5,
  "limitMaxAutomationFlows" = 0
WHERE "effectivePlan" IN ('RewardsPro Pro', 'Starter Plan', 'pro', 'starter');

-- Update Max plans: Enable Max-tier features
UPDATE "ShopEntitlements"
SET
  "featureRaffles" = true,
  "featureMysteryBoxes" = true,
  "featureChallenges" = true,
  "featureMarketingCampaigns" = true,
  "featureMarketingAutomation" = true,
  "featureAiRecommendations" = true,
  "featureRfmSegmentation" = true,
  "featureProgramImpact" = true,
  "featureRealtimeAnalytics" = true,
  "featureCohortAnalysis" = false,
  "limitMaxActiveRaffles" = 10,
  "limitMaxActiveMysteryBoxes" = 5,
  "limitMaxActiveChallenges" = 15,
  "limitMaxCampaigns" = 25,
  "limitMaxAutomationFlows" = 10
WHERE "effectivePlan" IN ('RewardsPro Max', 'Growth Plan', 'max', 'growth');

-- Update Ultra/Enterprise plans: Enable all features with unlimited limits
UPDATE "ShopEntitlements"
SET
  "featureRaffles" = true,
  "featureMysteryBoxes" = true,
  "featureChallenges" = true,
  "featureMarketingCampaigns" = true,
  "featureMarketingAutomation" = true,
  "featureAiRecommendations" = true,
  "featureRfmSegmentation" = true,
  "featureProgramImpact" = true,
  "featureRealtimeAnalytics" = true,
  "featureCohortAnalysis" = true,
  "limitMaxActiveRaffles" = 999999,
  "limitMaxActiveMysteryBoxes" = 999999,
  "limitMaxActiveChallenges" = 999999,
  "limitMaxCampaigns" = 999999,
  "limitMaxAutomationFlows" = 999999
WHERE "effectivePlan" IN ('RewardsPro Ultra', 'Enterprise', 'ultra', 'enterprise');
