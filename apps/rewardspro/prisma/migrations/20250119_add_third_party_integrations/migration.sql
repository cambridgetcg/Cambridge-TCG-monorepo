-- Third-Party Integration System Migration
-- Creates tables for managing integrations with external services like
-- Klaviyo, Judge.me, Recharge, Gorgias, etc.

-- =============================================
-- ENUMS
-- =============================================

-- Integration providers enum
CREATE TYPE "IntegrationProvider" AS ENUM (
  'KLAVIYO',
  'OMNISEND',
  'MAILCHIMP',
  'JUDGE_ME',
  'LOOX',
  'YOTPO_REVIEWS',
  'STAMPED',
  'OKENDO',
  'RECHARGE',
  'LOOP_SUBSCRIPTIONS',
  'BOLD_SUBSCRIPTIONS',
  'APPSTLE',
  'SKIO',
  'GORGIAS',
  'ZENDESK',
  'RICHPANEL',
  'POSTSCRIPT',
  'ATTENTIVE',
  'TRIPLE_WHALE',
  'LIFETIMELY',
  'POLAR_ANALYTICS',
  'CUSTOM_WEBHOOK'
);

-- Integration status enum
CREATE TYPE "IntegrationStatus" AS ENUM (
  'DISCONNECTED',
  'PENDING_AUTH',
  'CONNECTED',
  'ERROR',
  'RATE_LIMITED',
  'DISABLED'
);

-- Loyalty event type enum
CREATE TYPE "LoyaltyEventType" AS ENUM (
  'POINTS_EARNED',
  'POINTS_REDEEMED',
  'POINTS_EXPIRED',
  'POINTS_ADJUSTED',
  'TIER_UPGRADED',
  'TIER_DOWNGRADED',
  'TIER_PURCHASED',
  'TIER_SUBSCRIPTION_CREATED',
  'TIER_SUBSCRIPTION_CANCELLED',
  'REWARD_UNLOCKED',
  'REWARD_REDEEMED',
  'CUSTOMER_ENROLLED',
  'CUSTOMER_PROFILE_UPDATED',
  'REFERRAL_SENT',
  'REFERRAL_COMPLETED',
  'REVIEW_POINTS_AWARDED',
  'SUBSCRIPTION_POINTS_AWARDED'
);

-- Integration event status enum
CREATE TYPE "IntegrationEventStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'DELIVERED',
  'FAILED',
  'SKIPPED'
);

-- Integration webhook status enum
CREATE TYPE "IntegrationWebhookStatus" AS ENUM (
  'RECEIVED',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'DUPLICATE'
);

-- Integration points type enum
CREATE TYPE "IntegrationPointsType" AS ENUM (
  'FIXED',
  'PERCENTAGE',
  'TIERED'
);

-- =============================================
-- TABLES
-- =============================================

-- Integration configuration and credentials
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

-- Outbound loyalty events to integrations
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

-- Inbound webhooks from integrations
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

-- OAuth state storage for PKCE flow
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

-- Points rules for integration triggers
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

-- =============================================
-- INDEXES
-- =============================================

-- Integration indexes
CREATE UNIQUE INDEX "Integration_shop_provider_key" ON "Integration"("shop", "provider");
CREATE INDEX "Integration_shop_idx" ON "Integration"("shop");
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");

-- IntegrationEvent indexes
CREATE INDEX "IntegrationEvent_integrationId_status_idx" ON "IntegrationEvent"("integrationId", "status");
CREATE INDEX "IntegrationEvent_shop_eventType_idx" ON "IntegrationEvent"("shop", "eventType");
CREATE INDEX "IntegrationEvent_status_createdAt_idx" ON "IntegrationEvent"("status", "createdAt");

-- IntegrationWebhook indexes
CREATE UNIQUE INDEX "IntegrationWebhook_webhookId_key" ON "IntegrationWebhook"("webhookId");
CREATE INDEX "IntegrationWebhook_integrationId_topic_idx" ON "IntegrationWebhook"("integrationId", "topic");
CREATE INDEX "IntegrationWebhook_shop_status_idx" ON "IntegrationWebhook"("shop", "status");
CREATE INDEX "IntegrationWebhook_webhookId_idx" ON "IntegrationWebhook"("webhookId");

-- OAuthState indexes
CREATE UNIQUE INDEX "OAuthState_state_key" ON "OAuthState"("state");
CREATE INDEX "OAuthState_state_idx" ON "OAuthState"("state");
CREATE INDEX "OAuthState_expiresAt_idx" ON "OAuthState"("expiresAt");

-- IntegrationPointsRule indexes
CREATE UNIQUE INDEX "IntegrationPointsRule_shop_provider_triggerEvent_key" ON "IntegrationPointsRule"("shop", "provider", "triggerEvent");
CREATE INDEX "IntegrationPointsRule_shop_provider_idx" ON "IntegrationPointsRule"("shop", "provider");

-- =============================================
-- FOREIGN KEYS
-- =============================================

ALTER TABLE "IntegrationEvent" ADD CONSTRAINT "IntegrationEvent_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IntegrationWebhook" ADD CONSTRAINT "IntegrationWebhook_integrationId_fkey"
  FOREIGN KEY ("integrationId") REFERENCES "Integration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
