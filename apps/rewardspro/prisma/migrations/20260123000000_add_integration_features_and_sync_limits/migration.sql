-- Migration: Add integration feature flags and sync limits to ShopEntitlements
-- P0: Sync limits from plan-limits.ts
-- P1: Integration feature gating

-- ============================================
-- P0: Add synced limits (from plan-limits.ts)
-- ============================================

-- Automation limit (Free: 1, Pro: 5, Max: 20, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxAutomations" INTEGER NOT NULL DEFAULT 1;

-- Customer sync limit (Free: 1000, Pro: 10000, Max: 50000, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxCustomersSync" INTEGER NOT NULL DEFAULT 1000;

-- Tier products limit (Free: 2, Pro: 5, Max: 10, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxTierProducts" INTEGER NOT NULL DEFAULT 2;

-- Historical data retention days (Free: 30, Pro: 90, Max: 365, Ultra: unlimited)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "limitMaxHistoricalDays" INTEGER NOT NULL DEFAULT 30;

-- ============================================
-- P1: Add integration feature flags
-- ============================================

-- Klaviyo integration (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationKlaviyo" BOOLEAN NOT NULL DEFAULT false;

-- SendGrid integration (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationSendgrid" BOOLEAN NOT NULL DEFAULT false;

-- Judge.me integration (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationJudgeme" BOOLEAN NOT NULL DEFAULT false;

-- Slack integration (Pro+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationSlack" BOOLEAN NOT NULL DEFAULT false;

-- Recharge integration (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationRecharge" BOOLEAN NOT NULL DEFAULT false;

-- Gorgias integration (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationGorgias" BOOLEAN NOT NULL DEFAULT false;

-- Zapier integration (Max+)
ALTER TABLE "ShopEntitlements"
ADD COLUMN IF NOT EXISTS "featureIntegrationZapier" BOOLEAN NOT NULL DEFAULT false;

-- ============================================
-- Update existing records based on current plan
-- ============================================

-- Update Pro plans: Enable basic integrations
UPDATE "ShopEntitlements"
SET
  "featureIntegrationKlaviyo" = true,
  "featureIntegrationSendgrid" = true,
  "featureIntegrationJudgeme" = true,
  "featureIntegrationSlack" = true,
  "limitMaxAutomations" = 5,
  "limitMaxCustomersSync" = 10000,
  "limitMaxTierProducts" = 5,
  "limitMaxHistoricalDays" = 90
WHERE "effectivePlan" IN ('RewardsPro Pro', 'Starter Plan', 'pro', 'starter');

-- Update Max plans: Enable all integrations
UPDATE "ShopEntitlements"
SET
  "featureIntegrationKlaviyo" = true,
  "featureIntegrationSendgrid" = true,
  "featureIntegrationJudgeme" = true,
  "featureIntegrationSlack" = true,
  "featureIntegrationRecharge" = true,
  "featureIntegrationGorgias" = true,
  "featureIntegrationZapier" = true,
  "limitMaxAutomations" = 20,
  "limitMaxCustomersSync" = 50000,
  "limitMaxTierProducts" = 10,
  "limitMaxHistoricalDays" = 365
WHERE "effectivePlan" IN ('RewardsPro Max', 'Growth Plan', 'max', 'growth');

-- Update Ultra/Enterprise plans: Enable all integrations with unlimited
UPDATE "ShopEntitlements"
SET
  "featureIntegrationKlaviyo" = true,
  "featureIntegrationSendgrid" = true,
  "featureIntegrationJudgeme" = true,
  "featureIntegrationSlack" = true,
  "featureIntegrationRecharge" = true,
  "featureIntegrationGorgias" = true,
  "featureIntegrationZapier" = true,
  "limitMaxAutomations" = 999999,
  "limitMaxCustomersSync" = 999999,
  "limitMaxTierProducts" = 999999,
  "limitMaxHistoricalDays" = 999999
WHERE "effectivePlan" IN ('RewardsPro Ultra', 'Enterprise', 'ultra', 'enterprise');
