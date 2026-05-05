-- ============================================================================
-- Phase 2.5 — Schema-DB Reconciliation
-- ============================================================================
-- Aligns the Aurora schema with prisma/schema.prisma so the new Driver Adapter
-- can ship.
--   1. CREATE TYPE for 6 new enums + CREATE TABLE for 14 scaffolded features
--      (Q1 Integration platform + Q2 AI feedback loop)
--   2. ADD COLUMN for fields the schema declares but the DB lacks
--      (column types extracted from prisma migrate diff —from-empty to ensure
--      they match the schema's declared types/defaults exactly)
--   3. RENAME COLUMN for Q3 (BulkOperationLog) and Q4 (Challenge) — schema-side
--      names win because the codebase already uses them
--   4. DROP COLUMN for ReconciliationLog DB-only fields (Q5 — schema redesign;
--      legacy fields verified zero-usage)
--
-- Pre-flight verified: every NOT NULL ADD COLUMN targets an empty table OR
-- includes DEFAULT. Row counts at migration drafting time:
--   TierSubscription=0, SellingPlanGroup=0, SellingPlan=0, BulkOperationLog=0,
--   Raffle=3 (only NOT NULL DEFAULT adds), MysteryBox=4 (only DEFAULT adds),
--   RaffleEntry=0, MysteryBoxOpen=0, Challenge=0.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1A. ENUMS for new tables (Q1 + Q2)
-- ----------------------------------------------------------------------------
CREATE TYPE "IntegrationProvider" AS ENUM ('KLAVIYO', 'OMNISEND', 'MAILCHIMP', 'JUDGE_ME', 'LOOX', 'YOTPO_REVIEWS', 'STAMPED', 'OKENDO', 'RECHARGE', 'LOOP_SUBSCRIPTIONS', 'BOLD_SUBSCRIPTIONS', 'APPSTLE', 'SKIO', 'GORGIAS', 'ZENDESK', 'RICHPANEL', 'POSTSCRIPT', 'ATTENTIVE', 'TRIPLE_WHALE', 'LIFETIMELY', 'POLAR_ANALYTICS', 'ZAPIER', 'MAKE', 'SLACK', 'MICROSOFT_TEAMS', 'DISCORD', 'CUSTOM_WEBHOOK');

CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'PENDING_AUTH', 'CONNECTED', 'ERROR', 'RATE_LIMITED', 'DISABLED');

CREATE TYPE "LoyaltyEventType" AS ENUM ('POINTS_EARNED', 'POINTS_REDEEMED', 'POINTS_EXPIRED', 'POINTS_ADJUSTED', 'TIER_UPGRADED', 'TIER_DOWNGRADED', 'TIER_PURCHASED', 'TIER_SUBSCRIPTION_CREATED', 'TIER_SUBSCRIPTION_CANCELLED', 'REWARD_UNLOCKED', 'REWARD_REDEEMED', 'CUSTOMER_ENROLLED', 'CUSTOMER_PROFILE_UPDATED', 'REFERRAL_SENT', 'REFERRAL_COMPLETED', 'REVIEW_POINTS_AWARDED', 'SUBSCRIPTION_POINTS_AWARDED');

CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SKIPPED');

CREATE TYPE "IntegrationWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DUPLICATE');

CREATE TYPE "IntegrationPointsType" AS ENUM ('FIXED', 'PERCENTAGE', 'TIERED');

-- Created during Phase 2.5 — was declared in schema.prisma but absent from DB.
CREATE TYPE "CreditSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'NOT_APPLICABLE');

-- ----------------------------------------------------------------------------
-- 1B. NEW TABLES (CREATE TABLE statements appended programmatically below)
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- 2. ADD COLUMN — schema fields the DB lacks
-- ----------------------------------------------------------------------------

-- ShopSettings
ALTER TABLE "ShopSettings"
  ADD COLUMN IF NOT EXISTS "currentPlan" TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionUpdatedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "currentPlanName" TEXT,
  ADD COLUMN IF NOT EXISTS "usageCapReached" BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS "usageCapReachedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewBannerDismissed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "reviewClickedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "emailProvider" TEXT,
  ADD COLUMN IF NOT EXISTS "emailLogo" TEXT,
  ADD COLUMN IF NOT EXISTS "emailPrimaryColor" TEXT,
  ADD COLUMN IF NOT EXISTS "emailSecondaryColor" TEXT,
  ADD COLUMN IF NOT EXISTS "emailBackgroundColor" TEXT DEFAULT '#f4f4f4',
  ADD COLUMN IF NOT EXISTS "emailContentBgColor" TEXT DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS "emailLinkColor" TEXT,
  ADD COLUMN IF NOT EXISTS "emailFontFamily" TEXT DEFAULT 'Arial, sans-serif',
  ADD COLUMN IF NOT EXISTS "brandKitEnabled" BOOLEAN NOT NULL DEFAULT false;

-- ShopEntitlements
ALTER TABLE "ShopEntitlements"
  ADD COLUMN IF NOT EXISTS "featureIntegrationKlaviyo" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationSendgrid" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationJudgeme" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationSlack" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationRecharge" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationGorgias" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "featureIntegrationZapier" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "limitMaxAutomations" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "limitMaxCustomersSync" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN IF NOT EXISTS "limitMaxTierProducts" INTEGER NOT NULL DEFAULT 2,
  ADD COLUMN IF NOT EXISTS "limitMaxHistoricalDays" INTEGER NOT NULL DEFAULT 30;

-- CustomerTierState
ALTER TABLE "CustomerTierState"
  ADD COLUMN IF NOT EXISTS "manualOverrideTierId" TEXT;

-- StoreCreditLedger
ALTER TABLE "StoreCreditLedger"
  ADD COLUMN IF NOT EXISTS "shopifyTransactionId" TEXT,
  ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "syncStatus" "CreditSyncStatus" NOT NULL DEFAULT 'PENDING';

-- MonthlyOrderUsage
ALTER TABLE "MonthlyOrderUsage"
  ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lockReason" TEXT;

-- TierSubscription (table empty — NOT NULL adds are safe)
ALTER TABLE "TierSubscription"
  ADD COLUMN IF NOT EXISTS "lastPaymentFailure" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pauseReason" TEXT,
  ADD COLUMN IF NOT EXISTS "skipCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastSkipDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "deliveryInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';

-- SellingPlanGroup (table empty — NOT NULL adds are safe)
ALTER TABLE "SellingPlanGroup"
  ADD COLUMN IF NOT EXISTS "tierProducts" JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB;

-- SellingPlan (table empty — NOT NULL adds are safe)
ALTER TABLE "SellingPlan"
  ADD COLUMN IF NOT EXISTS "groupId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "shopifyPlanId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "options" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS "metadata" JSONB,
  ADD COLUMN IF NOT EXISTS "basePrice" DECIMAL(10,2),
  ADD COLUMN IF NOT EXISTS "currentDiscount" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "lastPriceUpdate" TIMESTAMP(3);

-- BulkOperationLog (table empty — NOT NULL add is safe)
ALTER TABLE "BulkOperationLog"
  ADD COLUMN IF NOT EXISTS "report" JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "cashbackPercentAtOrder" INTEGER,
  ADD COLUMN IF NOT EXISTS "syncedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "syncVersion" INTEGER NOT NULL DEFAULT 1;

-- Raffle (3 rows — only NOT NULL DEFAULT adds)
ALTER TABLE "Raffle"
  ADD COLUMN IF NOT EXISTS "enableInstantWins" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "enableActivityFeed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableStreakBonuses" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableLuckyNumbers" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "dailyFreeEntries" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "earlyBirdBonusPercent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "earlyBirdEntryLimit" INTEGER NOT NULL DEFAULT 0;

-- RaffleEntry (table empty)
ALTER TABLE "RaffleEntry"
  ADD COLUMN IF NOT EXISTS "streakBonusApplied" DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS "earlyBirdBonusApplied" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "luckyNumberBonus" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bonusEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "instantWinsTriggered" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isFreeEntry" BOOLEAN NOT NULL DEFAULT false;

-- MysteryBox (4 rows — only NOT NULL DEFAULT adds)
ALTER TABLE "MysteryBox"
  ADD COLUMN IF NOT EXISTS "enableActivityFeed" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableStreakBonuses" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enablePitySystem" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "enableLuckyStreak" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "dailyFreeOpens" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "pityThreshold" INTEGER NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS "luckyStreakMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0;

-- MysteryBoxOpen (table empty)
ALTER TABLE "MysteryBoxOpen"
  ADD COLUMN IF NOT EXISTS "streakDay" INTEGER,
  ADD COLUMN IF NOT EXISTS "streakBonusApplied" DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS "luckyStreakCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "luckyStreakBonus" DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS "bonusEventId" TEXT,
  ADD COLUMN IF NOT EXISTS "discountApplied" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "isFreeOpen" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pityTriggered" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "nearMissRewardId" TEXT;

-- ReconciliationLog (Q5: schema-side adds; legacy DB-side drops at end)
ALTER TABLE "ReconciliationLog"
  ADD COLUMN IF NOT EXISTS "localState" JSONB,
  ADD COLUMN IF NOT EXISTS "shopifyState" JSONB,
  ADD COLUMN IF NOT EXISTS "mismatches" JSONB,
  ADD COLUMN IF NOT EXISTS "resolution" TEXT,
  ADD COLUMN IF NOT EXISTS "resolvedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "resolvedBy" TEXT;

-- ----------------------------------------------------------------------------
-- 3. RENAME COLUMN — Q3 (BulkOperationLog) + Q4 (Challenge)
-- ----------------------------------------------------------------------------
-- Schema-side names win in both cases (codebase references them).
-- ALTER ... RENAME COLUMN is metadata-only — instant, atomic, data preserved.

-- Q3 BulkOperationLog
ALTER TABLE "BulkOperationLog" RENAME COLUMN "successCount" TO "successful";
ALTER TABLE "BulkOperationLog" RENAME COLUMN "failureCount" TO "failed";
ALTER TABLE "BulkOperationLog" RENAME COLUMN "totalCount" TO "total";

-- Q4 Challenge
ALTER TABLE "Challenge" RENAME COLUMN "participantCount" TO "totalParticipants";
ALTER TABLE "Challenge" RENAME COLUMN "completionCount" TO "completedCount";
ALTER TABLE "Challenge" RENAME COLUMN "claimCount" TO "claimedCount";
ALTER TABLE "Challenge" RENAME COLUMN "totalProgress" TO "totalRewardsAwarded";

-- ----------------------------------------------------------------------------
-- 4. DROP COLUMN — Q5 ReconciliationLog legacy fields (zero usage in code)
-- ----------------------------------------------------------------------------
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "reconciliationType";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "missingEvents";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "recoveredEvents";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "failedRecoveries";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "inconsistencies";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "summary";
-- Both tables are empty in dev; verified zero application references for these.
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "status";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "startedAt";
ALTER TABLE "ReconciliationLog" DROP COLUMN IF EXISTS "completedAt";

-- BulkOperationLog: drop legacy fields rendered redundant by schema redesign.
-- Table is empty; the renamed columns (successful, failed, total) have moved
-- the data forward; status/parameters/results/timestamps are unused.
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "status";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "parameters";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "results";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "startedAt";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "completedAt";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "createdBy";
ALTER TABLE "BulkOperationLog" DROP COLUMN IF EXISTS "updatedAt";

-- ----------------------------------------------------------------------------
-- 1B. NEW TABLES (verbatim from prisma migrate diff —from-empty)
-- ----------------------------------------------------------------------------
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "config" JSONB NOT NULL DEFAULT '{}',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "apiKey" TEXT,
    "apiSecret" TEXT,
    "webhookSecret" TEXT,
    "webhookUrl" TEXT,
    "webhookSubscriptions" JSONB NOT NULL DEFAULT '[]',
    "enabledFeatures" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "pointsConfig" JSONB,
    "lastSyncAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationEvent" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" "LoyaltyEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "IntegrationEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "error" TEXT,
    "customerId" TEXT,
    "shopifyCustomerId" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationWebhook" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB NOT NULL DEFAULT '{}',
    "status" "IntegrationWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "pointsAwarded" INTEGER,
    "actionsTaken" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntegrationWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OAuthState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "state" TEXT NOT NULL,
    "codeVerifier" TEXT,
    "redirectUri" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OAuthState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationPointsRule" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "triggerEvent" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "pointsType" "IntegrationPointsType" NOT NULL DEFAULT 'FIXED',
    "pointsAmount" INTEGER NOT NULL DEFAULT 0,
    "pointsPercent" DOUBLE PRECISION,
    "maxPoints" INTEGER,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationPointsRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISession" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "primaryIntent" TEXT,
    "territory" TEXT,
    "tasksCompleted" INTEGER NOT NULL DEFAULT 0,
    "tasksAttempted" INTEGER NOT NULL DEFAULT 0,
    "filesModified" INTEGER NOT NULL DEFAULT 0,
    "filesCreated" INTEGER NOT NULL DEFAULT 0,
    "satisfactionScore" INTEGER,
    "learnings" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AISession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISessionAction" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "filePath" TEXT,
    "description" TEXT NOT NULL,
    "patternUsed" TEXT,
    "wasSuccessful" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISessionAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AISessionFeedback" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "rating" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AISessionFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICodeMetric" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "filePath" TEXT NOT NULL,
    "metricType" TEXT NOT NULL,
    "valueBefore" DOUBLE PRECISION,
    "valueAfter" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICodeMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AILearningPattern" (
    "id" TEXT NOT NULL,
    "patternName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "timesUsed" INTEGER NOT NULL DEFAULT 0,
    "timesSuccessful" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "applicableTo" TEXT[],
    "antiPatterns" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AILearningPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AICodeQualitySignal" (
    "id" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "signalType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AICodeQualitySignal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIArchitectureHealth" (
    "id" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalFiles" INTEGER NOT NULL,
    "totalLines" INTEGER NOT NULL,
    "avgComplexity" DOUBLE PRECISION NOT NULL,
    "duplicateBlocks" INTEGER NOT NULL,
    "dataApiCompliant" DOUBLE PRECISION NOT NULL,
    "shopScopingCompliant" DOUBLE PRECISION NOT NULL,
    "errorHandlingScore" DOUBLE PRECISION NOT NULL,
    "trendDirection" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIArchitectureHealth_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIInnovationTracker" (
    "id" TEXT NOT NULL,
    "feature" TEXT NOT NULL,
    "territory" TEXT NOT NULL,
    "pioneering" BOOLEAN NOT NULL DEFAULT false,
    "pathQuality" TEXT,
    "enablesFuture" BOOLEAN NOT NULL DEFAULT false,
    "connectedTo" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIInnovationTracker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generateRequests" INTEGER NOT NULL DEFAULT 0,
    "enhanceRequests" INTEGER NOT NULL DEFAULT 0,
    "subjectRequests" INTEGER NOT NULL DEFAULT 0,
    "totalTokensInput" INTEGER NOT NULL DEFAULT 0,
    "totalTokensOutput" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- Indexes and foreign-key constraints for the new tables.
-- CreateIndex
CREATE INDEX "Integration_shop_idx" ON "Integration"("shop");

-- CreateIndex
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_shop_provider_key" ON "Integration"("shop", "provider");

-- CreateIndex
CREATE INDEX "IntegrationEvent_integrationId_status_idx" ON "IntegrationEvent"("integrationId", "status");

-- CreateIndex
CREATE INDEX "IntegrationEvent_shop_eventType_idx" ON "IntegrationEvent"("shop", "eventType");

-- CreateIndex
CREATE INDEX "IntegrationEvent_status_createdAt_idx" ON "IntegrationEvent"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationWebhook_webhookId_key" ON "IntegrationWebhook"("webhookId");

-- CreateIndex
CREATE INDEX "IntegrationWebhook_integrationId_topic_idx" ON "IntegrationWebhook"("integrationId", "topic");

-- CreateIndex
CREATE INDEX "IntegrationWebhook_shop_status_idx" ON "IntegrationWebhook"("shop", "status");

-- CreateIndex
CREATE INDEX "IntegrationWebhook_webhookId_idx" ON "IntegrationWebhook"("webhookId");

-- CreateIndex
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_state_idx" ON "OAuthState"("state");

-- CreateIndex
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- CreateIndex
CREATE INDEX "IntegrationPointsRule_shop_provider_idx" ON "IntegrationPointsRule"("shop", "provider");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationPointsRule_shop_provider_triggerEvent_key" ON "IntegrationPointsRule"("shop", "provider", "triggerEvent");

-- CreateIndex
CREATE UNIQUE INDEX "AISession_sessionId_key" ON "AISession"("sessionId");

-- CreateIndex
CREATE INDEX "AISession_startedAt_idx" ON "AISession"("startedAt");

-- CreateIndex
CREATE INDEX "AISessionAction_sessionId_idx" ON "AISessionAction"("sessionId");

-- CreateIndex
CREATE INDEX "AISessionAction_actionType_idx" ON "AISessionAction"("actionType");

-- CreateIndex
CREATE INDEX "AISessionFeedback_sessionId_idx" ON "AISessionFeedback"("sessionId");

-- CreateIndex
CREATE INDEX "AISessionFeedback_dimension_idx" ON "AISessionFeedback"("dimension");

-- CreateIndex
CREATE INDEX "AICodeMetric_sessionId_idx" ON "AICodeMetric"("sessionId");

-- CreateIndex
CREATE INDEX "AICodeMetric_filePath_idx" ON "AICodeMetric"("filePath");

-- CreateIndex
CREATE INDEX "AICodeMetric_metricType_idx" ON "AICodeMetric"("metricType");

-- CreateIndex
CREATE UNIQUE INDEX "AILearningPattern_patternName_key" ON "AILearningPattern"("patternName");

-- CreateIndex
CREATE INDEX "AILearningPattern_patternName_idx" ON "AILearningPattern"("patternName");

-- CreateIndex
CREATE INDEX "AILearningPattern_confidence_idx" ON "AILearningPattern"("confidence");

-- CreateIndex
CREATE INDEX "AICodeQualitySignal_area_idx" ON "AICodeQualitySignal"("area");

-- CreateIndex
CREATE INDEX "AICodeQualitySignal_signalType_idx" ON "AICodeQualitySignal"("signalType");

-- CreateIndex
CREATE INDEX "AICodeQualitySignal_resolved_idx" ON "AICodeQualitySignal"("resolved");

-- CreateIndex
CREATE INDEX "AIArchitectureHealth_snapshotDate_idx" ON "AIArchitectureHealth"("snapshotDate");

-- CreateIndex
CREATE INDEX "AIInnovationTracker_territory_idx" ON "AIInnovationTracker"("territory");

-- CreateIndex
CREATE INDEX "AIInnovationTracker_feature_idx" ON "AIInnovationTracker"("feature");

-- CreateIndex
CREATE INDEX "AIUsage_shop_idx" ON "AIUsage"("shop");

-- CreateIndex
CREATE INDEX "AIUsage_date_idx" ON "AIUsage"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsage_shop_date_key" ON "AIUsage"("shop", "date");

-- AddForeignKey
ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISessionAction" ADD CONSTRAINT "AISessionAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AISessionFeedback" ADD CONSTRAINT "AISessionFeedback_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AICodeMetric" ADD CONSTRAINT "AICodeMetric_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AISession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
