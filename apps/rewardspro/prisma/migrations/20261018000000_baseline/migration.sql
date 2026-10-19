-- Squashed baseline for the Postgres rebuild (2026-10-18).
--
-- Generated from prisma/schema.prisma with
--   prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
-- and replaces the Aurora-era history, which could not build a database
-- (prisma migrate deploy failed with P3018 on its first migration). That
-- history remains in git before this commit.
--
-- Object names are unqualified: they are created in the schema named by the
-- connection URL (?schema=rewardspro in production). The generated
-- CREATE SCHEMA IF NOT EXISTS "public" line is removed because the app role
-- does not have CREATE on the database and the schema is provisioned already.

-- CreateEnum
CREATE TYPE "EntitlementSource" AS ENUM ('DEFAULT', 'SUBSCRIPTION', 'OVERRIDE', 'LEGACY');

-- CreateEnum
CREATE TYPE "CustomerState" AS ENUM ('ENABLED', 'DISABLED', 'INVITED', 'DECLINED');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CreditSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'SYNCED', 'FAILED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY', 'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR');

-- CreateEnum
CREATE TYPE "CurrencyDisplayType" AS ENUM ('SYMBOL', 'CODE');

-- CreateEnum
CREATE TYPE "RecalculationFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "WidgetThemeMode" AS ENUM ('LIGHT', 'DARK', 'CUSTOM');

-- CreateEnum
CREATE TYPE "EvaluationPeriod" AS ENUM ('ANNUAL', 'LIFETIME');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('CASHBACK_EARNED', 'ORDER_PAYMENT', 'REFUND_CREDIT', 'REFUND_CLAWBACK', 'MANUAL_ADJUSTMENT', 'SHOPIFY_SYNC', 'CONVERTED_TO_GIFT_CARD');

-- CreateEnum
CREATE TYPE "TierChangeType" AS ENUM ('INITIAL_ASSIGNMENT', 'UPGRADE', 'DOWNGRADE', 'REVOKED');

-- CreateEnum
CREATE TYPE "TierTriggerType" AS ENUM ('ACCOUNT_CREATED', 'PERIODIC_REVIEW', 'SPENDING_MILESTONE', 'MANUAL_ADMIN', 'PRODUCT_PURCHASE', 'SUBSCRIPTION_STARTED', 'SUBSCRIPTION_RENEWED', 'SUBSCRIPTION_UPGRADED', 'SUBSCRIPTION_DOWNGRADED', 'SUBSCRIPTION_CANCELLED', 'SUBSCRIPTION_PURCHASE');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "TierSource" AS ENUM ('MANUAL_OVERRIDE', 'TIER_SUBSCRIPTION', 'TIER_PURCHASE', 'SPENDING_BASED', 'DEFAULT_BASE_TIER', 'NONE');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'PAUSED', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REQUIRES_ACTION');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateEnum
CREATE TYPE "PurchaseType" AS ENUM ('ONE_TIME', 'SUBSCRIPTION', 'BOTH');

-- CreateEnum
CREATE TYPE "ProductDuration" AS ENUM ('MONTHLY', 'ANNUAL', 'LIFETIME');

-- CreateEnum
CREATE TYPE "OrderFinancialStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'PARTIALLY_PAID', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "RetryStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SubscriptionEventType" AS ENUM ('CREATED', 'ACTIVATED', 'PAUSED', 'RESUMED', 'CANCELLED', 'PAYMENT_SUCCESS', 'PAYMENT_FAILED', 'PAYMENT_RETRY_SCHEDULED', 'DELIVERY_SKIPPED', 'BILLING_UPDATED', 'PLAN_CHANGED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "BillingAttemptStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED', 'RETRY_SCHEDULED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SyncStatusEnum" AS ENUM ('IDLE', 'RUNNING', 'FAILED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "SendingMode" AS ENUM ('SHARED', 'CUSTOM_DOMAIN');

-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('SENDGRID', 'KLAVIYO', 'HYBRID');

-- CreateEnum
CREATE TYPE "MarketingHubMode" AS ENUM ('UNCONFIGURED', 'INHOUSE', 'KLAVIYO');

-- CreateEnum
CREATE TYPE "KlaviyoSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'SYNCING', 'STALE', 'ERROR', 'UNSUBSCRIBED');

-- CreateEnum
CREATE TYPE "KlaviyoConsentStatus" AS ENUM ('UNKNOWN', 'SUBSCRIBED', 'NEVER_SUBSCRIBED', 'UNSUBSCRIBED', 'SUPPRESSED');

-- CreateEnum
CREATE TYPE "KlaviyoEventStatus" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'DNS_PENDING', 'VERIFYING', 'VERIFIED', 'FAILED');

-- CreateEnum
CREATE TYPE "PointsLedgerType" AS ENUM ('ORDER_EARNED', 'CHALLENGE_COMPLETED', 'SPIN_WHEEL_WIN', 'SCRATCH_CARD_WIN', 'MYSTERY_BOX_WIN', 'BONUS_EVENT', 'REFERRAL_BONUS', 'MANUAL_CREDIT', 'STREAK_BONUS', 'INSTANT_WIN', 'RAFFLE_ENTRY', 'MYSTERY_BOX_OPEN', 'PREMIUM_SPIN', 'GIVEBACK_DONATION', 'MANUAL_DEBIT', 'EXPIRATION', 'REFUND_CLAWBACK', 'SYSTEM_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "PointsRoundingMode" AS ENUM ('FLOOR', 'CEIL', 'ROUND');

-- CreateEnum
CREATE TYPE "RaffleStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'DRAWING', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RaffleDrawType" AS ENUM ('RANDOM', 'WEIGHTED', 'FIFO');

-- CreateEnum
CREATE TYPE "RafflePrizeType" AS ENUM ('DISCOUNT', 'STORE_CREDIT', 'PRODUCT', 'POINTS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "RafflePrizeDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "RaffleActivityType" AS ENUM ('ENTRY_PURCHASED', 'INSTANT_WIN', 'GRAND_WINNER', 'STREAK_MILESTONE', 'EARLY_BIRD', 'LUCKY_NUMBER');

-- CreateEnum
CREATE TYPE "RaffleBonusEventType" AS ENUM ('HAPPY_HOUR', 'FLASH_BONUS', 'EARLY_BIRD', 'LAST_CHANCE', 'MILESTONE');

-- CreateEnum
CREATE TYPE "MysteryBoxStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MysteryBoxRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "MysteryBoxRewardType" AS ENUM ('POINTS', 'DISCOUNT', 'STORE_CREDIT', 'PRODUCT', 'CUSTOM', 'NOTHING');

-- CreateEnum
CREATE TYPE "MysteryBoxDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'CLAIMED');

-- CreateEnum
CREATE TYPE "MysteryBoxActivityType" AS ENUM ('BOX_OPENED', 'RARE_WIN', 'EPIC_WIN', 'LEGENDARY_WIN', 'STREAK_MILESTONE', 'PITY_TRIGGERED', 'LUCKY_STREAK', 'FREE_OPEN_CLAIMED');

-- CreateEnum
CREATE TYPE "MysteryBoxBonusEventType" AS ENUM ('HAPPY_HOUR', 'FLASH_DISCOUNT', 'DOUBLE_REWARDS', 'LUCKY_HOUR', 'LAST_CHANCE');

-- CreateEnum
CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ChallengeObjectiveType" AS ENUM ('SPENDING', 'ORDER_COUNT', 'REFERRAL', 'PRODUCT_PURCHASE', 'REVIEW', 'STREAK');

-- CreateEnum
CREATE TYPE "ChallengeRewardType" AS ENUM ('POINTS', 'STORE_CREDIT', 'DISCOUNT', 'TIER_UPGRADE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "ChallengeParticipantStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CLAIMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "MissionCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'SPECIAL');

-- CreateEnum
CREATE TYPE "MissionRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "MissionCategory" AS ENUM ('SHOPPING', 'DISCOVERY', 'SOCIAL', 'STREAK', 'CHALLENGE');

-- CreateEnum
CREATE TYPE "MissionEventType" AS ENUM ('COMPLETE', 'CLAIM', 'MILESTONE', 'STREAK', 'COMBO', 'LEVEL_UP');

-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('KLAVIYO', 'OMNISEND', 'MAILCHIMP', 'JUDGE_ME', 'LOOX', 'YOTPO_REVIEWS', 'STAMPED', 'OKENDO', 'RECHARGE', 'LOOP_SUBSCRIPTIONS', 'BOLD_SUBSCRIPTIONS', 'APPSTLE', 'SKIO', 'GORGIAS', 'ZENDESK', 'RICHPANEL', 'POSTSCRIPT', 'ATTENTIVE', 'TRIPLE_WHALE', 'LIFETIMELY', 'POLAR_ANALYTICS', 'ZAPIER', 'MAKE', 'SLACK', 'MICROSOFT_TEAMS', 'DISCORD', 'CUSTOM_WEBHOOK');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'PENDING_AUTH', 'CONNECTED', 'ERROR', 'RATE_LIMITED', 'DISABLED');

-- CreateEnum
CREATE TYPE "LoyaltyEventType" AS ENUM ('POINTS_EARNED', 'POINTS_REDEEMED', 'POINTS_EXPIRED', 'POINTS_ADJUSTED', 'TIER_UPGRADED', 'TIER_DOWNGRADED', 'TIER_PURCHASED', 'TIER_SUBSCRIPTION_CREATED', 'TIER_SUBSCRIPTION_CANCELLED', 'REWARD_UNLOCKED', 'REWARD_REDEEMED', 'CUSTOMER_ENROLLED', 'CUSTOMER_PROFILE_UPDATED', 'REFERRAL_SENT', 'REFERRAL_COMPLETED', 'REVIEW_POINTS_AWARDED', 'SUBSCRIPTION_POINTS_AWARDED');

-- CreateEnum
CREATE TYPE "IntegrationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "IntegrationWebhookStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'COMPLETED', 'FAILED', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "IntegrationPointsType" AS ENUM ('FIXED', 'PERCENTAGE', 'TIERED');

-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DEACTIVATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GiftCardBundleType" AS ENUM ('VALUE_ONLY', 'MEMBERSHIP_ONLY', 'VALUE_PLUS_MEMBERSHIP');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "isActive" BOOLEAN DEFAULT true,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "storeCurrency" "Currency" NOT NULL DEFAULT 'USD',
    "currencyDisplayType" "CurrencyDisplayType" NOT NULL DEFAULT 'SYMBOL',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "emailProvider" TEXT,
    "emailLogo" TEXT,
    "emailPrimaryColor" TEXT,
    "emailSecondaryColor" TEXT,
    "emailBackgroundColor" TEXT DEFAULT '#f4f4f4',
    "emailContentBgColor" TEXT DEFAULT '#ffffff',
    "emailLinkColor" TEXT,
    "emailFontFamily" TEXT DEFAULT 'Arial, sans-serif',
    "brandKitEnabled" BOOLEAN NOT NULL DEFAULT false,
    "onboardingSyncedOrders" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCreatedTiers" BOOLEAN NOT NULL DEFAULT false,
    "onboardingSyncedCustomers" BOOLEAN NOT NULL DEFAULT false,
    "onboardingConfiguredSettings" BOOLEAN NOT NULL DEFAULT false,
    "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
    "onboardingDismissed" BOOLEAN NOT NULL DEFAULT false,
    "widgetLastHeartbeat" TIMESTAMP(3),
    "billingStatus" TEXT DEFAULT 'INACTIVE',
    "currentPlan" TEXT DEFAULT 'free',
    "subscriptionStatus" TEXT,
    "subscriptionUpdatedAt" TIMESTAMP(3),
    "currentPlanName" TEXT,
    "usageCapReached" BOOLEAN DEFAULT false,
    "usageCapReachedAt" TIMESTAMP(3),
    "customersInitialSynced" BOOLEAN NOT NULL DEFAULT false,
    "customersSyncInProgress" BOOLEAN NOT NULL DEFAULT false,
    "widgetIsActive" BOOLEAN NOT NULL DEFAULT false,
    "widgetSetupDismissed" BOOLEAN NOT NULL DEFAULT false,
    "reviewBannerDismissed" BOOLEAN NOT NULL DEFAULT false,
    "reviewClickedAt" TIMESTAMP(3),
    "customerAccountBlockDismissed" BOOLEAN NOT NULL DEFAULT false,
    "currencySelected" BOOLEAN NOT NULL DEFAULT false,
    "tierRecalculationFrequency" "RecalculationFrequency" NOT NULL DEFAULT 'WEEKLY',
    "tierRecalculationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "tierRecalculationLastRun" TIMESTAMP(3),
    "averageProfitMargin" DECIMAL(5,2),
    "averageCogsPercent" DECIMAL(5,2),
    "averageShippingCost" DECIMAL(10,2),
    "averageTransactionFee" DECIMAL(5,2),
    "averageReturnRate" DECIMAL(5,2),
    "averageOrderValue" DECIMAL(10,2),
    "targetRoiPercent" DECIMAL(5,2),
    "metricsLastUpdated" TIMESTAMP(3),
    "advancedAnalyticsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoCashbackProcessingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "emailMarketingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "tierProductsEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoAssignBaseTier" BOOLEAN NOT NULL DEFAULT true,
    "defaultBaseTierId" TEXT,
    "widgetThemeMode" "WidgetThemeMode" NOT NULL DEFAULT 'LIGHT',
    "widgetPrimaryColor" TEXT DEFAULT '#5C6AC4',
    "widgetBackgroundColor" TEXT DEFAULT '#FFFFFF',
    "widgetTextColor" TEXT DEFAULT '#212B36',
    "widgetAccentColor" TEXT DEFAULT '#008060',
    "widgetSecondaryTextColor" TEXT,
    "widgetBorderRadius" INTEGER DEFAULT 12,
    "widgetFontFamily" TEXT DEFAULT 'inherit',
    "maxLifetimeTrialDays" INTEGER NOT NULL DEFAULT 30,
    "minDaysBetweenTrials" INTEGER NOT NULL DEFAULT 30,
    "allowMultipleTierTrials" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopEntitlements" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "effectivePlan" TEXT NOT NULL DEFAULT 'RewardsPro Free',
    "planSource" "EntitlementSource" NOT NULL DEFAULT 'DEFAULT',
    "featureApiAccess" BOOLEAN NOT NULL DEFAULT true,
    "featureWebhooks" BOOLEAN NOT NULL DEFAULT true,
    "featureWhiteLabel" BOOLEAN NOT NULL DEFAULT false,
    "featureAdvancedReport" BOOLEAN NOT NULL DEFAULT true,
    "featureCustomEmail" BOOLEAN NOT NULL DEFAULT true,
    "featureAnnualEval" BOOLEAN NOT NULL DEFAULT true,
    "featureBulkOps" BOOLEAN NOT NULL DEFAULT true,
    "featureCustomBranding" BOOLEAN NOT NULL DEFAULT true,
    "featurePrioritySupport" BOOLEAN NOT NULL DEFAULT false,
    "featureSubscriptionTiers" BOOLEAN NOT NULL DEFAULT true,
    "featurePurchasableTiers" BOOLEAN NOT NULL DEFAULT true,
    "featureExportData" BOOLEAN NOT NULL DEFAULT true,
    "featureCustomRewards" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationKlaviyo" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationSendgrid" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationJudgeme" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationSlack" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationRecharge" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationGorgias" BOOLEAN NOT NULL DEFAULT true,
    "featureIntegrationZapier" BOOLEAN NOT NULL DEFAULT true,
    "featureRaffles" BOOLEAN NOT NULL DEFAULT true,
    "featureMysteryBoxes" BOOLEAN NOT NULL DEFAULT true,
    "featureChallenges" BOOLEAN NOT NULL DEFAULT true,
    "featureMarketingCampaigns" BOOLEAN NOT NULL DEFAULT true,
    "featureMarketingAutomation" BOOLEAN NOT NULL DEFAULT true,
    "featureAiRecommendations" BOOLEAN NOT NULL DEFAULT true,
    "featureRfmSegmentation" BOOLEAN NOT NULL DEFAULT true,
    "featureProgramImpact" BOOLEAN NOT NULL DEFAULT true,
    "featureRealtimeAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "featureCohortAnalysis" BOOLEAN NOT NULL DEFAULT true,
    "limitMaxTiers" INTEGER NOT NULL DEFAULT 5,
    "limitMaxOrders" INTEGER NOT NULL DEFAULT 1000,
    "limitMaxEmails" INTEGER NOT NULL DEFAULT 1000,
    "limitMaxAutomations" INTEGER NOT NULL DEFAULT 5,
    "limitMaxCustomersSync" INTEGER NOT NULL DEFAULT 10000,
    "limitMaxTierProducts" INTEGER NOT NULL DEFAULT 5,
    "limitMaxHistoricalDays" INTEGER NOT NULL DEFAULT 365,
    "limitMaxActiveRaffles" INTEGER NOT NULL DEFAULT 3,
    "limitMaxActiveMysteryBoxes" INTEGER NOT NULL DEFAULT 3,
    "limitMaxActiveChallenges" INTEGER NOT NULL DEFAULT 5,
    "limitMaxCampaigns" INTEGER NOT NULL DEFAULT 5,
    "limitMaxAutomationFlows" INTEGER NOT NULL DEFAULT 3,
    "hasOverride" BOOLEAN NOT NULL DEFAULT false,
    "overrideExpiry" TIMESTAMP(3),
    "overrideNote" TEXT,
    "overrideBy" TEXT,
    "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedFrom" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopEntitlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tier" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minSpend" INTEGER NOT NULL,
    "cashbackPercent" INTEGER NOT NULL,
    "evaluationPeriod" "EvaluationPeriod" NOT NULL DEFAULT 'ANNUAL',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "benefits" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "icon" TEXT DEFAULT '⭐',
    "color" TEXT DEFAULT '#FFD700',
    "threshold" INTEGER,
    "pointsMultiplier" DECIMAL(3,2) DEFAULT 1.0,
    "pointsLuckBonus" DECIMAL(5,2) DEFAULT 0,
    "raffleEntryMultiplier" DECIMAL(3,2) DEFAULT 1.0,
    "monthlyPrice" DECIMAL(10,2),
    "billingInterval" "BillingInterval",
    "discountPercentage" DECIMAL(5,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierProduct" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "shopifyProductId" TEXT NOT NULL,
    "shopifyVariantId" TEXT NOT NULL,
    "productHandle" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "purchaseType" "PurchaseType" NOT NULL,
    "duration" "ProductDuration",
    "hasSubscription" BOOLEAN NOT NULL DEFAULT false,
    "sellingPlanGroupId" TEXT,
    "shopifySellingPlanGroupId" TEXT,
    "subscriptionPlanIds" JSONB,
    "price" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "oneTimePrice" DECIMAL(10,2),
    "monthlyPrice" DECIMAL(10,2),
    "quarterlyPrice" DECIMAL(10,2),
    "annualPrice" DECIMAL(10,2),
    "features" JSONB,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deletionReason" TEXT,

    CONSTRAINT "TierProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierProductAuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tierProductId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedBy" TEXT,
    "previousState" JSONB,
    "newState" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierProductAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" VARCHAR(255) NOT NULL,
    "shopifyCustomerMetafieldId" VARCHAR(255),
    "email" VARCHAR(255) NOT NULL,
    "firstName" VARCHAR(255),
    "lastName" VARCHAR(255),
    "phone" VARCHAR(50),
    "tags" TEXT,
    "birthday" TIMESTAMP(3),
    "storeCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "pointsBalance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lifetimePoints" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "annualSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCashbackEarned" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalRefunded" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "lastOrderDate" TIMESTAMP(3),
    "acceptsMarketing" BOOLEAN NOT NULL DEFAULT true,
    "emailSuppressed" BOOLEAN NOT NULL DEFAULT false,
    "suppressedAt" TIMESTAMP(3),
    "suppressionReason" VARCHAR(255),
    "shopifyCreatedAt" TIMESTAMP(3),
    "shopifyUpdatedAt" TIMESTAMP(3),
    "currentTierId" TEXT,
    "currentSubscriptionId" TEXT,
    "hasActiveSubscription" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionTier" TEXT,
    "hasUsedTierTrial" BOOLEAN NOT NULL DEFAULT false,
    "firstTierTrialStartedAt" TIMESTAMP(3),
    "totalTierTrialDaysUsed" INTEGER NOT NULL DEFAULT 0,
    "lastTierTrialTierId" TEXT,
    "tierTrialHistory" JSONB,
    "state" "CustomerState" DEFAULT 'ENABLED',
    "marketingConsentUpdatedAt" TIMESTAMP(3),
    "verifiedEmail" BOOLEAN DEFAULT false,
    "note" TEXT,
    "ordersCount" INTEGER DEFAULT 0,
    "metadata" JSONB,
    "isGuest" BOOLEAN DEFAULT false,
    "hasAccount" BOOLEAN DEFAULT true,
    "fingerprint" TEXT,
    "companyId" TEXT,
    "previousEmails" JSONB,
    "emailChangedAt" TIMESTAMP(3),
    "mergedFromIds" JSONB,
    "mergedIntoId" TEXT,
    "isDeleted" BOOLEAN DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "isRedacted" BOOLEAN DEFAULT false,
    "redactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerTierState" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "effectiveTierId" TEXT,
    "tierSource" "TierSource" NOT NULL DEFAULT 'NONE',
    "tierSourceId" TEXT,
    "hasManualOverride" BOOLEAN NOT NULL DEFAULT false,
    "manualOverrideTierId" TEXT,
    "manualOverrideAt" TIMESTAMP(3),
    "manualOverrideBy" TEXT,
    "manualOverrideExpiry" TIMESTAMP(3),
    "manualOverrideNote" TEXT,
    "activePurchaseId" TEXT,
    "purchaseExpiresAt" TIMESTAMP(3),
    "activeSubscriptionId" TEXT,
    "subscriptionExpiresAt" TIMESTAMP(3),
    "spendingBasedTierId" TEXT,
    "spendingLastCalculated" TIMESTAMP(3),
    "lastResolvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolutionReason" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "nextTierId" TEXT,
    "nextTierName" TEXT,
    "nextTierMinSpend" DECIMAL(10,2),
    "amountToNextTier" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isMaxTier" BOOLEAN NOT NULL DEFAULT false,
    "progressCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerTierState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCustomers" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "lastError" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCreditSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCustomers" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 25,
    "totalImported" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalDifference" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreCreditSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalOrders" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "lastError" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreCreditLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "shopifyOrderId" TEXT,
    "shopifyTransactionId" TEXT,
    "syncStatus" "CreditSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "orderId" TEXT,
    "refundId" TEXT,
    "metadata" JSONB,
    "expiresAt" TIMESTAMP(3),
    "isExpired" BOOLEAN DEFAULT false,
    "currency" TEXT DEFAULT 'USD',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "enableTierBranding" BOOLEAN NOT NULL DEFAULT true,
    "enableTierBonuses" BOOLEAN NOT NULL DEFAULT false,
    "enableMembershipGifts" BOOLEAN NOT NULL DEFAULT true,
    "defaultTemplateSuffix" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierGiftCardSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "templateSuffix" TEXT,
    "bonusPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "canBundleWithCard" BOOLEAN NOT NULL DEFAULT true,
    "bundlePrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierGiftCardSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IssuedGiftCard" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyGiftCardId" TEXT NOT NULL,
    "lastFourDigits" TEXT,
    "initialValue" DECIMAL(10,2) NOT NULL,
    "bonusValue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalValue" DECIMAL(10,2) NOT NULL,
    "templateSuffix" TEXT,
    "purchaserTierId" TEXT,
    "purchaserTierName" TEXT,
    "bundleType" "GiftCardBundleType" NOT NULL DEFAULT 'VALUE_ONLY',
    "bundledTierId" TEXT,
    "bundledTierName" TEXT,
    "bundledDuration" TEXT,
    "purchasedByCustomerId" TEXT,
    "purchasedByEmail" TEXT,
    "recipientCustomerId" TEXT,
    "recipientEmail" TEXT,
    "recipientName" TEXT,
    "personalMessage" TEXT,
    "scheduledSendAt" TIMESTAMP(3),
    "status" "GiftCardStatus" NOT NULL DEFAULT 'ACTIVE',
    "redeemedAt" TIMESTAMP(3),
    "tierActivatedAt" TIMESTAMP(3),
    "convertedFromLedgerId" TEXT,
    "shopifyOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IssuedGiftCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GiftCardBundle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "tierId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "bundleType" "GiftCardBundleType" NOT NULL,
    "giftCardValue" DECIMAL(10,2) NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "membershipDuration" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GiftCardBundle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierChangeLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "fromTierId" TEXT,
    "fromTierName" TEXT,
    "toTierId" TEXT,
    "toTierName" TEXT,
    "changeType" "TierChangeType" NOT NULL,
    "triggerType" "TierTriggerType" NOT NULL,
    "totalSpending" DECIMAL(10,2),
    "periodSpending" DECIMAL(10,2),
    "orderId" TEXT,
    "subscriptionId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedBy" TEXT,

    CONSTRAINT "TierChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "subscriptionStatus" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "recurringLineItemId" TEXT,
    "usageLineItemId" TEXT,
    "pendingChargeId" TEXT,
    "pendingChargeCreatedAt" TIMESTAMP(3),
    "confirmationUrl" TEXT,
    "currentPeriodOrders" INTEGER NOT NULL DEFAULT 0,
    "currentPeriodUsageFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "lastUsageReset" TIMESTAMP(3),
    "usageCappedAmount" DECIMAL(10,2),
    "lastChargedBatch" INTEGER,
    "billingVersion" TEXT NOT NULL DEFAULT 'graphql',
    "migratedAt" TIMESTAMP(3),
    "planType" TEXT,
    "trialEndsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "planName" TEXT,
    "status" TEXT DEFAULT 'PENDING',
    "isTest" BOOLEAN DEFAULT false,
    "cappedAmount" DECIMAL(10,2),
    "balanceUsed" DECIMAL(10,2) DEFAULT 0,
    "balanceRemaining" DECIMAL(10,2),

    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppSubscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifySubscriptionId" TEXT,
    "chargeId" TEXT,
    "planName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "test" BOOLEAN NOT NULL DEFAULT false,
    "trialDays" INTEGER,
    "trialEndsAt" TIMESTAMP(3),
    "hasUsedTrial" BOOLEAN NOT NULL DEFAULT false,
    "firstTrialStartedAt" TIMESTAMP(3),
    "totalTrialDaysUsed" INTEGER NOT NULL DEFAULT 0,
    "lastTrialPlanId" TEXT,
    "recurringAmount" DECIMAL(10,2),
    "recurringCurrency" TEXT,
    "recurringInterval" TEXT,
    "usageCap" DECIMAL(10,2),
    "usageCurrency" TEXT,
    "usageTerms" TEXT,
    "usageBalanceUsed" DECIMAL(10,2),
    "currentPeriodEnd" TIMESTAMP(3),
    "nextBillingDate" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "lastWebhookUpdate" TIMESTAMP(3),
    "webhookUpdateCount" INTEGER NOT NULL DEFAULT 0,
    "webhookTimestamp" TIMESTAMP(3),
    "returnUrlProcessed" BOOLEAN NOT NULL DEFAULT false,
    "returnUrlProcessedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrialAuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "planName" TEXT,
    "trialDaysRequested" INTEGER NOT NULL,
    "trialDaysGranted" INTEGER NOT NULL DEFAULT 0,
    "previousPlanId" TEXT,
    "previousPlanName" TEXT,
    "wasInTrial" BOOLEAN NOT NULL DEFAULT false,
    "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "eligibilityCheck" JSONB,
    "requestSource" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierTrialAuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT NOT NULL,
    "tierName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "wasBlocked" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "trialDaysRequested" INTEGER NOT NULL,
    "trialDaysGranted" INTEGER NOT NULL DEFAULT 0,
    "previousTierId" TEXT,
    "previousTierName" TEXT,
    "wasInTrial" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionId" TEXT,
    "requestSource" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TierTrialAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyUsageRecordId" TEXT,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'USD',
    "idempotencyKey" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "billingPlanId" TEXT,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageSummary" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "ordersProcessed" INTEGER NOT NULL,
    "cashbackIssued" DECIMAL(10,2) NOT NULL,
    "customersActive" INTEGER NOT NULL,
    "chargeAmount" DECIMAL(10,2) NOT NULL,
    "chargeId" TEXT,
    "charged" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingHistory" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(10,2),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingPlanId" TEXT,

    CONSTRAINT "BillingHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "planName" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shopifyContractId" TEXT,
    "planName" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "billingInterval" TEXT NOT NULL,
    "billingIntervalCount" INTEGER NOT NULL DEFAULT 1,
    "nextBillingDate" TIMESTAMP(3),
    "lastBillingDate" TIMESTAMP(3),
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "trialEndsAt" TIMESTAMP(3),
    "paymentMethodId" TEXT,
    "lastPaymentStatus" "PaymentStatus",
    "failedPaymentCount" INTEGER NOT NULL DEFAULT 0,
    "activatedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "features" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAttempt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "status" "BillingAttemptStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "paymentMethodId" TEXT,
    "transactionId" TEXT,
    "nextRetryAt" TIMESTAMP(3),
    "retriesRemaining" INTEGER NOT NULL DEFAULT 3,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),

    CONSTRAINT "BillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentMethodValidation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "paymentMethodId" TEXT NOT NULL,
    "isValid" BOOLEAN NOT NULL,
    "errors" JSONB,
    "warnings" JSONB,
    "instrumentType" TEXT,
    "lastDigits" TEXT,
    "expiryMonth" INTEGER,
    "expiryYear" INTEGER,
    "brand" TEXT,
    "validatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethodValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyOrderUsage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "orderCount" INTEGER NOT NULL DEFAULT 0,
    "planLimit" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "lastOrderDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyOrderUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonthlyEmailUsage" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "emailCount" INTEGER NOT NULL DEFAULT 0,
    "planLimit" INTEGER NOT NULL,
    "planName" TEXT NOT NULL,
    "campaignEmails" INTEGER NOT NULL DEFAULT 0,
    "automationEmails" INTEGER NOT NULL DEFAULT 0,
    "transactionalEmails" INTEGER NOT NULL DEFAULT 0,
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "lastEmailDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlyEmailUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierSubscription" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT,
    "tierProductId" TEXT,
    "subscriptionContractId" TEXT NOT NULL,
    "sellingPlanId" TEXT NOT NULL,
    "sellingPlanGroupId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
    "billingInterval" "BillingInterval" NOT NULL,
    "deliveryInterval" "BillingInterval" NOT NULL,
    "basePrice" DECIMAL(10,2) NOT NULL,
    "discountPercentage" INTEGER NOT NULL DEFAULT 0,
    "finalPrice" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "nextBillingDate" TIMESTAMP(3),
    "lastBillingDate" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "resumedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "failedPaymentCount" INTEGER NOT NULL DEFAULT 0,
    "lastPaymentFailure" TIMESTAMP(3),
    "pauseReason" TEXT,
    "skipCount" INTEGER NOT NULL DEFAULT 0,
    "lastSkipDate" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "monthlyPrice" DECIMAL(10,2) NOT NULL,
    "lastBillingAmount" DECIMAL(10,2),
    "activatedAt" TIMESTAMP(3),
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureReason" TEXT,
    "shopifyContractId" TEXT,
    "shopifyOrderId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "currentPrice" DECIMAL(10,2),

    CONSTRAINT "TierSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionBillingAttempt" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "idempotencyKey" TEXT NOT NULL,
    "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" "Currency" NOT NULL DEFAULT 'USD',
    "shopifyOrderId" TEXT,
    "shopifyBillingAttemptId" TEXT,
    "shopifyInvoiceUrl" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "attemptedAt" TIMESTAMP(3),
    "succeededAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingDate" TIMESTAMP(3) NOT NULL,
    "shopifyChargeId" TEXT,
    "shopifyInvoiceId" TEXT,
    "processedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionBillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellingPlanGroup" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifySellingPlanGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "merchantCode" TEXT NOT NULL,
    "tierProducts" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER,

    CONSTRAINT "SellingPlanGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellingPlan" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "shopifyPlanId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "billingInterval" "BillingInterval" NOT NULL,
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "discountType" "DiscountType",
    "discountValue" DECIMAL(10,2),
    "options" JSONB NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "basePrice" DECIMAL(10,2),
    "currentDiscount" DECIMAL(5,2),
    "lastPriceUpdate" TIMESTAMP(3),
    "sellingPlanGroupId" TEXT NOT NULL,
    "shopifySellingPlanId" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SellingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPricingConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "allowPriceEditing" BOOLEAN NOT NULL DEFAULT true,
    "requireApproval" BOOLEAN NOT NULL DEFAULT false,
    "minDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "maxDiscountPercent" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "priceChangeNotice" INTEGER NOT NULL DEFAULT 30,
    "allowGrandfathering" BOOLEAN NOT NULL DEFAULT true,
    "autoSyncPrices" BOOLEAN NOT NULL DEFAULT true,
    "notifyCustomers" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionPricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookProcess" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookProcess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookError" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "orderId" TEXT,
    "error" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookError_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TierPurchase" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT,
    "tierProductId" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "PurchaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BulkOperationLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "operationType" TEXT NOT NULL,
    "report" JSONB NOT NULL,
    "successful" INTEGER NOT NULL,
    "failed" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BulkOperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionRetry" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "attemptNumber" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "executedAt" TIMESTAMP(3),
    "status" "RetryStatus" NOT NULL,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "billingAmount" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionRetry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "customerId" TEXT,
    "eventType" "SubscriptionEventType" NOT NULL,
    "eventData" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionProcessingLock" (
    "id" TEXT NOT NULL,
    "lockKey" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "SubscriptionProcessingLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "shopifyOrderNumber" TEXT NOT NULL,
    "shopifyOrderName" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "presentmentCurrency" TEXT,
    "presentmentTotal" DECIMAL(10,2),
    "exchangeRate" DECIMAL(10,6),
    "subtotalPrice" DECIMAL(10,2) NOT NULL,
    "totalDiscounts" DECIMAL(10,2) NOT NULL,
    "totalShipping" DECIMAL(10,2) NOT NULL,
    "totalTax" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "totalRefunded" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "financialStatus" "OrderFinancialStatus" NOT NULL,
    "fulfillmentStatus" TEXT,
    "cashbackEligible" BOOLEAN NOT NULL DEFAULT true,
    "cashbackPercent" INTEGER,
    "cashbackPercentAtOrder" INTEGER,
    "cashbackAmount" DECIMAL(10,2),
    "cashbackProcessed" BOOLEAN NOT NULL DEFAULT false,
    "tierIdAtOrder" TEXT,
    "tierNameAtOrder" TEXT,
    "shopifyCreatedAt" TIMESTAMP(3) NOT NULL,
    "shopifyUpdatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "syncedAt" TIMESTAMP(3),
    "syncVersion" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderLineItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "shopifyProductId" TEXT,
    "shopifyVariantId" TEXT,
    "title" TEXT NOT NULL,
    "variantTitle" TEXT,
    "sku" TEXT,
    "vendor" TEXT,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "totalPrice" DECIMAL(10,2) NOT NULL,
    "totalDiscount" DECIMAL(10,2) NOT NULL,
    "requiresShipping" BOOLEAN NOT NULL DEFAULT true,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "giftCard" BOOLEAN NOT NULL DEFAULT false,
    "isTierProduct" BOOLEAN NOT NULL DEFAULT false,
    "tierProductId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "shopifyRefundId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "shippingAmount" DECIMAL(10,2) NOT NULL,
    "taxAmount" DECIMAL(10,2) NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "cashbackAdjustment" DECIMAL(10,2),
    "cashbackProcessed" BOOLEAN NOT NULL DEFAULT false,
    "shopifyCreatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderRefundLineItem" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "shopifyLineItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRefundLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookProcessed" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookProcessed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronLock" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "instanceId" TEXT,

    CONSTRAINT "CronLock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeadLetterQueue" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeadLetterQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncStatus" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "syncType" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,
    "lastSuccessfulId" TEXT,
    "syncCursor" TEXT,
    "status" "SyncStatusEnum" NOT NULL,
    "errorMessage" TEXT,
    "recordsProcessed" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL DEFAULT 'USD',
    "rates" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "previewText" TEXT,
    "bodyHtml" TEXT,
    "bodyText" TEXT,
    "htmlContent" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailCampaign" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "previewText" TEXT,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "segmentRules" JSONB NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "metrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailAutomation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "conditions" JSONB NOT NULL,
    "delayMinutes" INTEGER NOT NULL DEFAULT 0,
    "totalSent" INTEGER NOT NULL DEFAULT 0,
    "totalOpened" INTEGER NOT NULL DEFAULT 0,
    "totalClicked" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PendingAutomation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "automationId" TEXT NOT NULL,
    "automationName" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "recipientEmail" VARCHAR(255) NOT NULL,
    "recipientFirstName" VARCHAR(255),
    "recipientLastName" VARCHAR(255),
    "triggerType" TEXT NOT NULL,
    "triggerData" JSONB,
    "executeAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "error" TEXT,

    CONSTRAINT "PendingAutomation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSettings" (
    "shop" TEXT NOT NULL,
    "senderName" TEXT NOT NULL DEFAULT 'Store',
    "senderEmail" TEXT NOT NULL,
    "replyToEmail" TEXT,
    "brandColors" JSONB NOT NULL DEFAULT '{"primary":"#5C6AC4","secondary":"#F4F6F8"}',
    "typography" JSONB NOT NULL DEFAULT '{"fontFamily":"Inter"}',
    "headerContent" JSONB,
    "footerContent" JSONB,
    "suppressionList" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "includeUnsubscribe" BOOLEAN NOT NULL DEFAULT true,
    "includePhysicalAddress" BOOLEAN NOT NULL DEFAULT true,
    "gdprEnabled" BOOLEAN NOT NULL DEFAULT true,
    "sendTimePrefs" JSONB NOT NULL DEFAULT '{"preferredTime":"10:00","timezone":"America/New_York","dailyLimit":1000,"hourlyLimit":100}',
    "sendingMode" "SendingMode" NOT NULL DEFAULT 'SHARED',
    "customDomainId" TEXT,
    "emailProvider" "EmailProvider" NOT NULL DEFAULT 'SENDGRID',
    "marketingHubMode" "MarketingHubMode" NOT NULL DEFAULT 'UNCONFIGURED',
    "marketingModeSetAt" TIMESTAMP(3),
    "hasSeenMarketingChoice" BOOLEAN NOT NULL DEFAULT false,
    "klaviyoEnabled" BOOLEAN NOT NULL DEFAULT false,
    "klaviyoApiKey" TEXT,
    "klaviyoPublicKey" TEXT,
    "klaviyoDefaultListId" TEXT,
    "klaviyoIntegrationId" TEXT,
    "klaviyoSyncProfiles" BOOLEAN NOT NULL DEFAULT true,
    "klaviyoSyncEvents" BOOLEAN NOT NULL DEFAULT true,
    "klaviyoSyncConsent" TEXT NOT NULL DEFAULT 'EXPLICIT',
    "klaviyoLastSyncAt" TIMESTAMP(3),
    "klaviyoSyncStatus" TEXT,
    "klaviyoSyncError" TEXT,
    "klaviyoWebhookSecret" TEXT,
    "klaviyoWebhookId" TEXT,
    "klaviyoWebhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "klaviyoOAuthConnected" BOOLEAN NOT NULL DEFAULT false,
    "klaviyoAccessToken" TEXT,
    "klaviyoRefreshToken" TEXT,
    "klaviyoTokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "SendGridDomain" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "subdomain" TEXT,
    "sendgridDomainId" TEXT,
    "sendgridDnsRecords" JSONB,
    "status" "DomainStatus" NOT NULL DEFAULT 'PENDING',
    "verifiedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "dkimVerified" BOOLEAN NOT NULL DEFAULT false,
    "spfVerified" BOOLEAN NOT NULL DEFAULT false,
    "dmarcConfigured" BOOLEAN NOT NULL DEFAULT false,
    "lastError" TEXT,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SendGridDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "campaignId" TEXT,
    "automationId" TEXT,
    "customerId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsRecommendation" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "segmentPayload" JSONB NOT NULL,
    "metadata" JSONB,
    "predictedRevenue" DOUBLE PRECISION,
    "affectedCount" INTEGER NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "appliedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KlaviyoProfile" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "klaviyoProfileId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "shopifyCustomerId" TEXT,
    "syncStatus" "KlaviyoSyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncedAt" TIMESTAMP(3),
    "syncVersion" INTEGER NOT NULL DEFAULT 1,
    "lastSyncError" TEXT,
    "syncRetryCount" INTEGER NOT NULL DEFAULT 0,
    "profileDataHash" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "lastEventType" TEXT,
    "lastKnownSegment" TEXT,
    "emailConsent" "KlaviyoConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "smsConsent" "KlaviyoConsentStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consentUpdatedAt" TIMESTAMP(3),
    "listIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "segmentIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlaviyoProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KlaviyoEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "uniqueId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "customerId" TEXT,
    "klaviyoProfileId" TEXT,
    "customerEmail" TEXT NOT NULL,
    "eventValue" DECIMAL(10,2),
    "eventProperties" JSONB NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "orderId" TEXT,
    "orderRefundId" TEXT,
    "tierChangeLogId" TEXT,
    "status" "KlaviyoEventStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "nextRetryAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlaviyoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KlaviyoList" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "klaviyoListId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "listType" TEXT NOT NULL DEFAULT 'list',
    "purpose" TEXT,
    "segmentRules" JSONB,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isManaged" BOOLEAN NOT NULL DEFAULT false,
    "profileCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlaviyoList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KlaviyoAutomationSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "automationsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sendCustomerEnrolled" BOOLEAN NOT NULL DEFAULT true,
    "sendCustomerBirthday" BOOLEAN NOT NULL DEFAULT true,
    "sendCustomerAnniversary" BOOLEAN NOT NULL DEFAULT true,
    "sendOrderPlaced" BOOLEAN NOT NULL DEFAULT true,
    "sendCashbackEarned" BOOLEAN NOT NULL DEFAULT true,
    "sendCashbackRedeemed" BOOLEAN NOT NULL DEFAULT true,
    "sendTierUpgraded" BOOLEAN NOT NULL DEFAULT true,
    "sendTierDowngraded" BOOLEAN NOT NULL DEFAULT true,
    "sendTierUpgradeNear" BOOLEAN NOT NULL DEFAULT true,
    "sendVipAchieved" BOOLEAN NOT NULL DEFAULT true,
    "sendPointsExpiring" BOOLEAN NOT NULL DEFAULT true,
    "sendBalanceReminder" BOOLEAN NOT NULL DEFAULT true,
    "sendWinBack" BOOLEAN NOT NULL DEFAULT true,
    "sendCashbackAdjusted" BOOLEAN NOT NULL DEFAULT true,
    "sendCustomerBecameChampion" BOOLEAN NOT NULL DEFAULT true,
    "sendCustomerBecameLoyal" BOOLEAN NOT NULL DEFAULT true,
    "pointsExpiryWarningDays" INTEGER[] DEFAULT ARRAY[30, 7, 1]::INTEGER[],
    "balanceReminderDays" INTEGER NOT NULL DEFAULT 30,
    "winBackTriggerDays" INTEGER[] DEFAULT ARRAY[60, 90]::INTEGER[],
    "tierNudgeThreshold" INTEGER NOT NULL DEFAULT 80,
    "expiryReminderCooldownDays" INTEGER NOT NULL DEFAULT 7,
    "balanceReminderCooldownDays" INTEGER NOT NULL DEFAULT 14,
    "winBackCooldownDays" INTEGER NOT NULL DEFAULT 30,
    "tierNudgeCooldownDays" INTEGER NOT NULL DEFAULT 14,
    "scheduledJobTime" TEXT NOT NULL DEFAULT '06:00',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KlaviyoAutomationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,
    "currencyName" TEXT NOT NULL DEFAULT 'Points',
    "currencyNamePlural" TEXT NOT NULL DEFAULT 'Points',
    "currencyIcon" TEXT NOT NULL DEFAULT '⭐',
    "pointsPerDollar" INTEGER NOT NULL DEFAULT 10,
    "roundingMode" "PointsRoundingMode" NOT NULL DEFAULT 'FLOOR',
    "pointsExpire" BOOLEAN NOT NULL DEFAULT false,
    "expirationDays" INTEGER NOT NULL DEFAULT 365,
    "expirationWarningDays" INTEGER NOT NULL DEFAULT 30,
    "rafflesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mysteryBoxesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "spinWheelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "challengesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scratchCardsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "givebackPoolsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "dailySpinEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySpinResetHour" INTEGER NOT NULL DEFAULT 0,
    "premiumSpinCost" INTEGER NOT NULL DEFAULT 500,
    "streakBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "streakBonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 0.1,
    "missionsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "xpEnabled" BOOLEAN NOT NULL DEFAULT true,
    "xpPerLevel" INTEGER NOT NULL DEFAULT 100,
    "xpLevelScaling" DECIMAL(3,2) NOT NULL DEFAULT 1.2,
    "missionStreakBonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "missionStreakBonusPercent" INTEGER NOT NULL DEFAULT 10,
    "maxMissionStreakBonus" INTEGER NOT NULL DEFAULT 100,
    "comboEnabled" BOOLEAN NOT NULL DEFAULT true,
    "comboBonusPercent" INTEGER NOT NULL DEFAULT 25,
    "maxComboBonus" INTEGER NOT NULL DEFAULT 100,
    "missionResetHour" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "type" "PointsLedgerType" NOT NULL,
    "orderId" TEXT,
    "raffleEntryId" TEXT,
    "mysteryBoxOpenId" TEXT,
    "spinResultId" TEXT,
    "challengeId" TEXT,
    "scratchCardId" TEXT,
    "bonusEventId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Raffle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "RaffleStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "drawAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),
    "entryCost" INTEGER NOT NULL DEFAULT 100,
    "maxEntriesTotal" INTEGER,
    "maxEntriesPerCustomer" INTEGER NOT NULL DEFAULT 10,
    "drawType" "RaffleDrawType" NOT NULL DEFAULT 'RANDOM',
    "totalWinners" INTEGER NOT NULL DEFAULT 1,
    "totalEntries" INTEGER NOT NULL DEFAULT 0,
    "uniqueEntrants" INTEGER NOT NULL DEFAULT 0,
    "totalPrizePool" INTEGER NOT NULL DEFAULT 0,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "tierRestrictions" JSONB,
    "minimumTier" TEXT,
    "enableInstantWins" BOOLEAN NOT NULL DEFAULT false,
    "enableActivityFeed" BOOLEAN NOT NULL DEFAULT true,
    "enableStreakBonuses" BOOLEAN NOT NULL DEFAULT true,
    "enableLuckyNumbers" BOOLEAN NOT NULL DEFAULT true,
    "dailyFreeEntries" INTEGER NOT NULL DEFAULT 0,
    "earlyBirdBonusPercent" INTEGER NOT NULL DEFAULT 0,
    "earlyBirdEntryLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RafflePrize" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "prizeType" "RafflePrizeType" NOT NULL,
    "prizeValue" JSONB NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantityWon" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "weight" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RafflePrize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleEntry" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "entriesCount" INTEGER NOT NULL DEFAULT 1,
    "pointsSpent" INTEGER NOT NULL,
    "entryMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "streakBonusApplied" DECIMAL(3,2),
    "earlyBirdBonusApplied" BOOLEAN NOT NULL DEFAULT false,
    "luckyNumberBonus" INTEGER NOT NULL DEFAULT 0,
    "bonusEventId" TEXT,
    "instantWinsTriggered" INTEGER NOT NULL DEFAULT 0,
    "isFreeEntry" BOOLEAN NOT NULL DEFAULT false,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleWinner" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "raffleEntryId" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "winPosition" INTEGER NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveryStatus" "RafflePrizeDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveryNotes" TEXT,
    "discountCode" TEXT,
    "storeCreditId" TEXT,
    "pointsLedgerId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleStreak" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastEntryDate" TIMESTAMP(3),
    "streakStartDate" TIMESTAMP(3),
    "freeEntriesUsedToday" INTEGER NOT NULL DEFAULT 0,
    "freeEntryLastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleInstantWin" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "prizeType" "RafflePrizeType" NOT NULL,
    "prizeValue" JSONB NOT NULL,
    "winChancePercent" DECIMAL(7,6) NOT NULL,
    "rarity" TEXT NOT NULL DEFAULT 'COMMON',
    "maxWinsTotal" INTEGER,
    "maxWinsPerCustomer" INTEGER NOT NULL DEFAULT 1,
    "currentWinsTotal" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleInstantWin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleInstantWinLog" (
    "id" TEXT NOT NULL,
    "instantWinId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "raffleEntryId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "delivered" BOOLEAN NOT NULL DEFAULT false,
    "deliveredAt" TIMESTAMP(3),
    "deliveryData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleInstantWinLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleActivity" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "activityType" "RaffleActivityType" NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleBonusEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "raffleId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "RaffleBonusEventType" NOT NULL,
    "bonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.5,
    "bonusEntriesFlat" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDays" JSONB,
    "recurringHours" JSONB,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerCustomer" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleBonusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleBonusEventUsage" (
    "id" TEXT NOT NULL,
    "bonusEventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "usageCount" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleBonusEventUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RaffleLuckyNumber" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "luckyNumber" INTEGER NOT NULL,
    "bonusType" TEXT NOT NULL,
    "bonusEntries" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleLuckyNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBox" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "MysteryBoxStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "openCost" INTEGER NOT NULL DEFAULT 100,
    "maxOpensTotal" INTEGER,
    "maxOpensPerCustomer" INTEGER NOT NULL DEFAULT 5,
    "tierRestrictions" JSONB,
    "minimumTier" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "totalOpens" INTEGER NOT NULL DEFAULT 0,
    "uniqueOpeners" INTEGER NOT NULL DEFAULT 0,
    "totalSpent" INTEGER NOT NULL DEFAULT 0,
    "enableActivityFeed" BOOLEAN NOT NULL DEFAULT true,
    "enableStreakBonuses" BOOLEAN NOT NULL DEFAULT true,
    "enablePitySystem" BOOLEAN NOT NULL DEFAULT true,
    "enableLuckyStreak" BOOLEAN NOT NULL DEFAULT true,
    "dailyFreeOpens" INTEGER NOT NULL DEFAULT 0,
    "pityThreshold" INTEGER NOT NULL DEFAULT 10,
    "luckyStreakMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MysteryBox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxReward" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "rewardType" "MysteryBoxRewardType" NOT NULL,
    "rewardValue" JSONB NOT NULL,
    "probability" DECIMAL(5,2) NOT NULL,
    "rarity" "MysteryBoxRarity" NOT NULL DEFAULT 'COMMON',
    "quantity" INTEGER,
    "quantityWon" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MysteryBoxReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxOpen" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "pointsSpent" INTEGER NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "streakDay" INTEGER,
    "streakBonusApplied" DECIMAL(3,2),
    "luckyStreakCount" INTEGER NOT NULL DEFAULT 0,
    "luckyStreakBonus" DECIMAL(3,2),
    "bonusEventId" TEXT,
    "discountApplied" INTEGER NOT NULL DEFAULT 0,
    "isFreeOpen" BOOLEAN NOT NULL DEFAULT false,
    "pityTriggered" BOOLEAN NOT NULL DEFAULT false,
    "nearMissRewardId" TEXT,

    CONSTRAINT "MysteryBoxOpen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxWinner" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "openId" TEXT NOT NULL,
    "rewardId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "deliveryStatus" "MysteryBoxDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveryNotes" TEXT,
    "discountCode" TEXT,
    "storeCreditId" TEXT,
    "pointsLedgerId" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "notifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MysteryBoxWinner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxStreak" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastOpenDate" TIMESTAMP(3),
    "streakStartDate" TIMESTAMP(3),
    "freeOpensUsedToday" INTEGER NOT NULL DEFAULT 0,
    "freeOpenLastUsedAt" TIMESTAMP(3),
    "luckyStreakCount" INTEGER NOT NULL DEFAULT 0,
    "luckyStreakUpdatedAt" TIMESTAMP(3),
    "commonsSinceRare" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MysteryBoxStreak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxActivity" (
    "id" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "activityType" "MysteryBoxActivityType" NOT NULL,
    "customerId" TEXT,
    "displayName" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryBoxActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxBonusEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "boxId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "MysteryBoxBonusEventType" NOT NULL,
    "discountPercent" SMALLINT NOT NULL DEFAULT 0,
    "bonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    "extraRewardChance" SMALLINT NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringDays" JSONB,
    "recurringHours" JSONB,
    "maxUses" INTEGER,
    "currentUses" INTEGER NOT NULL DEFAULT 0,
    "maxUsesPerCustomer" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MysteryBoxBonusEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MysteryBoxBonusEventUsage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryBoxBonusEventUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Challenge" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "objectiveType" "ChallengeObjectiveType" NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "objectiveConfig" JSONB,
    "tierRestrictions" JSONB,
    "minimumTierId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "cadence" "MissionCadence" NOT NULL DEFAULT 'SPECIAL',
    "rarity" "MissionRarity" NOT NULL DEFAULT 'COMMON',
    "category" "MissionCategory" NOT NULL DEFAULT 'CHALLENGE',
    "xpReward" INTEGER NOT NULL DEFAULT 10,
    "templateId" TEXT,
    "comboEligible" BOOLEAN NOT NULL DEFAULT true,
    "streakEligible" BOOLEAN NOT NULL DEFAULT true,
    "iconEmoji" TEXT DEFAULT '🎯',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "nextResetAt" TIMESTAMP(3),
    "totalParticipants" INTEGER NOT NULL DEFAULT 0,
    "completedCount" INTEGER NOT NULL DEFAULT 0,
    "claimedCount" INTEGER NOT NULL DEFAULT 0,
    "totalRewardsAwarded" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeReward" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "rewardType" "ChallengeRewardType" NOT NULL,
    "rewardValue" JSONB NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeParticipant" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "currentProgress" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "status" "ChallengeParticipantStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "rewardDelivered" BOOLEAN NOT NULL DEFAULT false,
    "rewardDeliveryId" TEXT,
    "rewardDeliveryNotes" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChallengeProgressLog" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "progressDelta" INTEGER NOT NULL,
    "newProgress" INTEGER NOT NULL,
    "newProgressPercent" INTEGER NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeProgressLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionTemplate" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "objectiveType" "ChallengeObjectiveType" NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "objectiveConfig" JSONB,
    "cadence" "MissionCadence" NOT NULL,
    "rarity" "MissionRarity" NOT NULL DEFAULT 'COMMON',
    "category" "MissionCategory" NOT NULL DEFAULT 'CHALLENGE',
    "xpReward" INTEGER NOT NULL DEFAULT 10,
    "rewardType" "ChallengeRewardType" NOT NULL,
    "rewardValue" JSONB NOT NULL,
    "rewardDescription" TEXT NOT NULL,
    "iconEmoji" TEXT NOT NULL DEFAULT '🎯',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "tierRestrictions" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MissionTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerMissionStats" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "totalXp" INTEGER NOT NULL DEFAULT 0,
    "currentLevel" INTEGER NOT NULL DEFAULT 1,
    "xpToNextLevel" INTEGER NOT NULL DEFAULT 100,
    "totalCompleted" INTEGER NOT NULL DEFAULT 0,
    "dailyCompleted" INTEGER NOT NULL DEFAULT 0,
    "weeklyCompleted" INTEGER NOT NULL DEFAULT 0,
    "monthlyCompleted" INTEGER NOT NULL DEFAULT 0,
    "currentStreak" INTEGER NOT NULL DEFAULT 0,
    "longestStreak" INTEGER NOT NULL DEFAULT 0,
    "lastMissionDate" TIMESTAMP(3),
    "todayComboCount" INTEGER NOT NULL DEFAULT 0,
    "lastComboResetAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerMissionStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MissionCompletionEvent" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "eventType" "MissionEventType" NOT NULL,
    "xpEarned" INTEGER NOT NULL DEFAULT 0,
    "bonusXp" INTEGER NOT NULL DEFAULT 0,
    "triggersConfetti" BOOLEAN NOT NULL DEFAULT false,
    "triggersLevelUp" BOOLEAN NOT NULL DEFAULT false,
    "triggersStreakFire" BOOLEAN NOT NULL DEFAULT false,
    "payload" JSONB,
    "acknowledged" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MissionCompletionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhook" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "payloadHash" TEXT,

    CONSTRAINT "ProcessedWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookAuditLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "incomingTimestamp" TIMESTAMP(3),
    "existingTimestamp" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReconciliationLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "localState" JSONB,
    "shopifyState" JSONB,
    "mismatches" JSONB,
    "mismatchCount" INTEGER NOT NULL DEFAULT 0,
    "action" TEXT NOT NULL,
    "resolution" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReconciliationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
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

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "ShopSettings_shop_idx" ON "ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "ShopSettings_tierRecalculationEnabled_tierRecalculationLast_idx" ON "ShopSettings"("tierRecalculationEnabled", "tierRecalculationLastRun");

-- CreateIndex
CREATE UNIQUE INDEX "ShopEntitlements_shop_key" ON "ShopEntitlements"("shop");

-- CreateIndex
CREATE INDEX "ShopEntitlements_shop_idx" ON "ShopEntitlements"("shop");

-- CreateIndex
CREATE INDEX "ShopEntitlements_effectivePlan_idx" ON "ShopEntitlements"("effectivePlan");

-- CreateIndex
CREATE INDEX "ShopEntitlements_hasOverride_idx" ON "ShopEntitlements"("hasOverride");

-- CreateIndex
CREATE INDEX "Tier_shop_idx" ON "Tier"("shop");

-- CreateIndex
CREATE INDEX "Tier_cashbackPercent_idx" ON "Tier"("cashbackPercent");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_shop_name_key" ON "Tier"("shop", "name");

-- CreateIndex
CREATE INDEX "TierProduct_shop_tierId_idx" ON "TierProduct"("shop", "tierId");

-- CreateIndex
CREATE INDEX "TierProduct_shop_isActive_idx" ON "TierProduct"("shop", "isActive");

-- CreateIndex
CREATE INDEX "TierProduct_shop_deletedAt_idx" ON "TierProduct"("shop", "deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TierProduct_shop_shopifyProductId_key" ON "TierProduct"("shop", "shopifyProductId");

-- CreateIndex
CREATE UNIQUE INDEX "TierProduct_shop_shopifyVariantId_key" ON "TierProduct"("shop", "shopifyVariantId");

-- CreateIndex
CREATE INDEX "TierProductAuditLog_shop_tierProductId_idx" ON "TierProductAuditLog"("shop", "tierProductId");

-- CreateIndex
CREATE INDEX "TierProductAuditLog_shop_action_idx" ON "TierProductAuditLog"("shop", "action");

-- CreateIndex
CREATE INDEX "TierProductAuditLog_createdAt_idx" ON "TierProductAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_currentSubscriptionId_key" ON "Customer"("currentSubscriptionId");

-- CreateIndex
CREATE INDEX "Customer_shop_idx" ON "Customer"("shop");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "Customer"("email");

-- CreateIndex
CREATE INDEX "Customer_shop_shopifyCustomerMetafieldId_idx" ON "Customer"("shop", "shopifyCustomerMetafieldId");

-- CreateIndex
CREATE INDEX "Customer_shop_createdAt_idx" ON "Customer"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Customer_shop_currentTierId_createdAt_idx" ON "Customer"("shop", "currentTierId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Customer_shop_storeCredit_idx" ON "Customer"("shop", "storeCredit");

-- CreateIndex
CREATE INDEX "Customer_shop_createdAt_orderCount_idx" ON "Customer"("shop", "createdAt", "orderCount");

-- CreateIndex
CREATE INDEX "Customer_shop_lastOrderDate_idx" ON "Customer"("shop", "lastOrderDate");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shop_shopifyCustomerId_key" ON "Customer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerTierState_customerId_key" ON "CustomerTierState"("customerId");

-- CreateIndex
CREATE INDEX "CustomerTierState_shop_effectiveTierId_idx" ON "CustomerTierState"("shop", "effectiveTierId");

-- CreateIndex
CREATE INDEX "CustomerTierState_shop_tierSource_idx" ON "CustomerTierState"("shop", "tierSource");

-- CreateIndex
CREATE INDEX "CustomerTierState_hasManualOverride_idx" ON "CustomerTierState"("hasManualOverride");

-- CreateIndex
CREATE INDEX "CustomerTierState_purchaseExpiresAt_idx" ON "CustomerTierState"("purchaseExpiresAt");

-- CreateIndex
CREATE INDEX "CustomerTierState_subscriptionExpiresAt_idx" ON "CustomerTierState"("subscriptionExpiresAt");

-- CreateIndex
CREATE INDEX "CustomerTierState_isMaxTier_idx" ON "CustomerTierState"("isMaxTier");

-- CreateIndex
CREATE INDEX "CustomerSyncJob_shop_status_idx" ON "CustomerSyncJob"("shop", "status");

-- CreateIndex
CREATE INDEX "CustomerSyncJob_shop_createdAt_idx" ON "CustomerSyncJob"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StoreCreditSyncJob_shop_status_idx" ON "StoreCreditSyncJob"("shop", "status");

-- CreateIndex
CREATE INDEX "StoreCreditSyncJob_shop_createdAt_idx" ON "StoreCreditSyncJob"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "OrderSyncJob_shop_status_idx" ON "OrderSyncJob"("shop", "status");

-- CreateIndex
CREATE INDEX "OrderSyncJob_shop_createdAt_idx" ON "OrderSyncJob"("shop", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCreditLedger_refundId_key" ON "StoreCreditLedger"("refundId");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_customerId_idx" ON "StoreCreditLedger"("customerId");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_type_idx" ON "StoreCreditLedger"("type");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_createdAt_idx" ON "StoreCreditLedger"("createdAt");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_customerId_expiresAt_idx" ON "StoreCreditLedger"("customerId", "expiresAt");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_customerId_shop_createdAt_idx" ON "StoreCreditLedger"("customerId", "shop", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "StoreCreditLedger_shop_shopifyOrderId_type_key" ON "StoreCreditLedger"("shop", "shopifyOrderId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "GiftCardConfig_shop_key" ON "GiftCardConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "TierGiftCardSettings_tierId_key" ON "TierGiftCardSettings"("tierId");

-- CreateIndex
CREATE INDEX "TierGiftCardSettings_shop_idx" ON "TierGiftCardSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedGiftCard_shopifyGiftCardId_key" ON "IssuedGiftCard"("shopifyGiftCardId");

-- CreateIndex
CREATE INDEX "IssuedGiftCard_shop_status_idx" ON "IssuedGiftCard"("shop", "status");

-- CreateIndex
CREATE INDEX "IssuedGiftCard_recipientCustomerId_idx" ON "IssuedGiftCard"("recipientCustomerId");

-- CreateIndex
CREATE INDEX "IssuedGiftCard_purchasedByCustomerId_idx" ON "IssuedGiftCard"("purchasedByCustomerId");

-- CreateIndex
CREATE INDEX "IssuedGiftCard_shopifyOrderId_idx" ON "IssuedGiftCard"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "GiftCardBundle_shop_isActive_idx" ON "GiftCardBundle"("shop", "isActive");

-- CreateIndex
CREATE INDEX "TierChangeLog_customerId_createdAt_idx" ON "TierChangeLog"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_shop_createdAt_idx" ON "TierChangeLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_changeType_idx" ON "TierChangeLog"("changeType");

-- CreateIndex
CREATE INDEX "TierChangeLog_triggerType_idx" ON "TierChangeLog"("triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSubscription_shop_key" ON "BillingSubscription"("shop");

-- CreateIndex
CREATE INDEX "BillingSubscription_shop_idx" ON "BillingSubscription"("shop");

-- CreateIndex
CREATE INDEX "BillingSubscription_subscriptionStatus_idx" ON "BillingSubscription"("subscriptionStatus");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shop_key" ON "AppSubscription"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "AppSubscription_shopifySubscriptionId_key" ON "AppSubscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_shop_status_idx" ON "AppSubscription"("shop", "status");

-- CreateIndex
CREATE INDEX "AppSubscription_shopifySubscriptionId_idx" ON "AppSubscription"("shopifySubscriptionId");

-- CreateIndex
CREATE INDEX "AppSubscription_chargeId_idx" ON "AppSubscription"("chargeId");

-- CreateIndex
CREATE INDEX "AppSubscription_status_nextBillingDate_idx" ON "AppSubscription"("status", "nextBillingDate");

-- CreateIndex
CREATE INDEX "TrialAuditLog_shop_idx" ON "TrialAuditLog"("shop");

-- CreateIndex
CREATE INDEX "TrialAuditLog_shop_createdAt_idx" ON "TrialAuditLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "TrialAuditLog_wasBlocked_idx" ON "TrialAuditLog"("wasBlocked");

-- CreateIndex
CREATE INDEX "TrialAuditLog_createdAt_idx" ON "TrialAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_shop_idx" ON "TierTrialAuditLog"("shop");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_shop_customerId_idx" ON "TierTrialAuditLog"("shop", "customerId");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_customerId_tierId_idx" ON "TierTrialAuditLog"("customerId", "tierId");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_shop_createdAt_idx" ON "TierTrialAuditLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_wasBlocked_idx" ON "TierTrialAuditLog"("wasBlocked");

-- CreateIndex
CREATE INDEX "TierTrialAuditLog_createdAt_idx" ON "TierTrialAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_processedAt_idx" ON "UsageRecord"("shop", "processedAt" DESC);

-- CreateIndex
CREATE INDEX "UsageRecord_shop_idempotencyKey_idx" ON "UsageRecord"("shop", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UsageSummary_shop_date_idx" ON "UsageSummary"("shop", "date" DESC);

-- CreateIndex
CREATE INDEX "UsageSummary_charged_idx" ON "UsageSummary"("charged");

-- CreateIndex
CREATE UNIQUE INDEX "UsageSummary_shop_date_key" ON "UsageSummary"("shop", "date");

-- CreateIndex
CREATE INDEX "BillingHistory_shop_createdAt_idx" ON "BillingHistory"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BillingHistory_eventType_idx" ON "BillingHistory"("eventType");

-- CreateIndex
CREATE INDEX "Notification_shop_read_idx" ON "Notification"("shop", "read");

-- CreateIndex
CREATE INDEX "Notification_shop_createdAt_idx" ON "Notification"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BillingAuditLog_shop_attemptedAt_idx" ON "BillingAuditLog"("shop", "attemptedAt" DESC);

-- CreateIndex
CREATE INDEX "BillingAuditLog_shop_planName_idx" ON "BillingAuditLog"("shop", "planName");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shopifyContractId_key" ON "Subscription"("shopifyContractId");

-- CreateIndex
CREATE INDEX "Subscription_shop_idx" ON "Subscription"("shop");

-- CreateIndex
CREATE INDEX "Subscription_customerId_idx" ON "Subscription"("customerId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_nextBillingDate_idx" ON "Subscription"("nextBillingDate");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_shop_customerId_planName_key" ON "Subscription"("shop", "customerId", "planName");

-- CreateIndex
CREATE INDEX "BillingAttempt_subscriptionId_idx" ON "BillingAttempt"("subscriptionId");

-- CreateIndex
CREATE INDEX "BillingAttempt_status_idx" ON "BillingAttempt"("status");

-- CreateIndex
CREATE INDEX "BillingAttempt_attemptedAt_idx" ON "BillingAttempt"("attemptedAt");

-- CreateIndex
CREATE INDEX "PaymentMethodValidation_shop_idx" ON "PaymentMethodValidation"("shop");

-- CreateIndex
CREATE INDEX "PaymentMethodValidation_customerId_idx" ON "PaymentMethodValidation"("customerId");

-- CreateIndex
CREATE INDEX "PaymentMethodValidation_isValid_idx" ON "PaymentMethodValidation"("isValid");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentMethodValidation_customerId_paymentMethodId_key" ON "PaymentMethodValidation"("customerId", "paymentMethodId");

-- CreateIndex
CREATE INDEX "MonthlyOrderUsage_shop_year_month_idx" ON "MonthlyOrderUsage"("shop", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyOrderUsage_shop_isLocked_idx" ON "MonthlyOrderUsage"("shop", "isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyOrderUsage_shop_year_month_key" ON "MonthlyOrderUsage"("shop", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyEmailUsage_shop_year_month_idx" ON "MonthlyEmailUsage"("shop", "year", "month");

-- CreateIndex
CREATE INDEX "MonthlyEmailUsage_shop_isLocked_idx" ON "MonthlyEmailUsage"("shop", "isLocked");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyEmailUsage_shop_year_month_key" ON "MonthlyEmailUsage"("shop", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TierSubscription_subscriptionContractId_key" ON "TierSubscription"("subscriptionContractId");

-- CreateIndex
CREATE INDEX "TierSubscription_shop_customerId_idx" ON "TierSubscription"("shop", "customerId");

-- CreateIndex
CREATE INDEX "TierSubscription_shop_status_idx" ON "TierSubscription"("shop", "status");

-- CreateIndex
CREATE INDEX "TierSubscription_subscriptionContractId_idx" ON "TierSubscription"("subscriptionContractId");

-- CreateIndex
CREATE INDEX "TierSubscription_status_nextBillingDate_idx" ON "TierSubscription"("status", "nextBillingDate");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionBillingAttempt_idempotencyKey_key" ON "SubscriptionBillingAttempt"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SubscriptionBillingAttempt_subscriptionId_status_idx" ON "SubscriptionBillingAttempt"("subscriptionId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionBillingAttempt_scheduledFor_idx" ON "SubscriptionBillingAttempt"("scheduledFor");

-- CreateIndex
CREATE INDEX "SubscriptionBillingAttempt_idempotencyKey_idx" ON "SubscriptionBillingAttempt"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "SellingPlanGroup_shopifySellingPlanGroupId_key" ON "SellingPlanGroup"("shopifySellingPlanGroupId");

-- CreateIndex
CREATE INDEX "SellingPlanGroup_shop_idx" ON "SellingPlanGroup"("shop");

-- CreateIndex
CREATE INDEX "SellingPlanGroup_shopifySellingPlanGroupId_idx" ON "SellingPlanGroup"("shopifySellingPlanGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "SellingPlan_shopifyPlanId_key" ON "SellingPlan"("shopifyPlanId");

-- CreateIndex
CREATE INDEX "SellingPlan_groupId_idx" ON "SellingPlan"("groupId");

-- CreateIndex
CREATE INDEX "SellingPlan_shopifyPlanId_idx" ON "SellingPlan"("shopifyPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPricingConfig_shop_key" ON "SubscriptionPricingConfig"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookProcess_idempotencyKey_key" ON "WebhookProcess"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WebhookProcess_shop_topic_processedAt_idx" ON "WebhookProcess"("shop", "topic", "processedAt");

-- CreateIndex
CREATE INDEX "WebhookError_shop_createdAt_idx" ON "WebhookError"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "TierPurchase_customerId_status_idx" ON "TierPurchase"("customerId", "status");

-- CreateIndex
CREATE INDEX "TierPurchase_shop_status_endDate_idx" ON "TierPurchase"("shop", "status", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "TierPurchase_shop_shopifyOrderId_shopifyLineItemId_key" ON "TierPurchase"("shop", "shopifyOrderId", "shopifyLineItemId");

-- CreateIndex
CREATE INDEX "BulkOperationLog_shop_operationType_createdAt_idx" ON "BulkOperationLog"("shop", "operationType", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionRetry_shop_status_idx" ON "SubscriptionRetry"("shop", "status");

-- CreateIndex
CREATE INDEX "SubscriptionRetry_contractId_status_idx" ON "SubscriptionRetry"("contractId", "status");

-- CreateIndex
CREATE INDEX "SubscriptionRetry_scheduledFor_idx" ON "SubscriptionRetry"("scheduledFor");

-- CreateIndex
CREATE INDEX "SubscriptionRetry_shop_contractId_attemptNumber_idx" ON "SubscriptionRetry"("shop", "contractId", "attemptNumber");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_contractId_idx" ON "SubscriptionEvent"("contractId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_eventType_processedAt_idx" ON "SubscriptionEvent"("eventType", "processedAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_shop_eventType_createdAt_idx" ON "SubscriptionEvent"("shop", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_customerId_eventType_idx" ON "SubscriptionEvent"("customerId", "eventType");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionProcessingLock_lockKey_key" ON "SubscriptionProcessingLock"("lockKey");

-- CreateIndex
CREATE INDEX "SubscriptionProcessingLock_expiresAt_idx" ON "SubscriptionProcessingLock"("expiresAt");

-- CreateIndex
CREATE INDEX "SubscriptionProcessingLock_operation_acquiredAt_idx" ON "SubscriptionProcessingLock"("operation", "acquiredAt");

-- CreateIndex
CREATE INDEX "Order_shop_customerId_idx" ON "Order"("shop", "customerId");

-- CreateIndex
CREATE INDEX "Order_shop_shopifyCreatedAt_idx" ON "Order"("shop", "shopifyCreatedAt");

-- CreateIndex
CREATE INDEX "Order_shop_financialStatus_idx" ON "Order"("shop", "financialStatus");

-- CreateIndex
CREATE INDEX "Order_customerId_shopifyCreatedAt_idx" ON "Order"("customerId", "shopifyCreatedAt");

-- CreateIndex
CREATE INDEX "Order_shop_shopifyUpdatedAt_idx" ON "Order"("shop", "shopifyUpdatedAt");

-- CreateIndex
CREATE INDEX "Order_shop_syncedAt_idx" ON "Order"("shop", "syncedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shop_shopifyOrderId_key" ON "Order"("shop", "shopifyOrderId");

-- CreateIndex
CREATE INDEX "OrderLineItem_orderId_idx" ON "OrderLineItem"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderLineItem_orderId_shopifyLineItemId_key" ON "OrderLineItem"("orderId", "shopifyLineItemId");

-- CreateIndex
CREATE INDEX "OrderRefund_orderId_idx" ON "OrderRefund"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderRefund_orderId_shopifyRefundId_key" ON "OrderRefund"("orderId", "shopifyRefundId");

-- CreateIndex
CREATE INDEX "OrderRefundLineItem_refundId_idx" ON "OrderRefundLineItem"("refundId");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookProcessed_webhookId_key" ON "WebhookProcessed"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookProcessed_shop_topic_idx" ON "WebhookProcessed"("shop", "topic");

-- CreateIndex
CREATE UNIQUE INDEX "CronLock_jobName_key" ON "CronLock"("jobName");

-- CreateIndex
CREATE INDEX "CronLock_expiresAt_idx" ON "CronLock"("expiresAt");

-- CreateIndex
CREATE INDEX "DeadLetterQueue_shop_failedAt_idx" ON "DeadLetterQueue"("shop", "failedAt");

-- CreateIndex
CREATE INDEX "SyncStatus_shop_lastSyncAt_idx" ON "SyncStatus"("shop", "lastSyncAt");

-- CreateIndex
CREATE UNIQUE INDEX "SyncStatus_shop_syncType_key" ON "SyncStatus"("shop", "syncType");

-- CreateIndex
CREATE INDEX "ExchangeRate_baseCurrency_fetchedAt_idx" ON "ExchangeRate"("baseCurrency", "fetchedAt" DESC);

-- CreateIndex
CREATE INDEX "ExchangeRate_createdAt_idx" ON "ExchangeRate"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "SystemAlert_type_resolved_idx" ON "SystemAlert"("type", "resolved");

-- CreateIndex
CREATE INDEX "SystemAlert_severity_createdAt_idx" ON "SystemAlert"("severity", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailTemplate_shop_type_idx" ON "EmailTemplate"("shop", "type");

-- CreateIndex
CREATE INDEX "EmailTemplate_shop_isActive_idx" ON "EmailTemplate"("shop", "isActive");

-- CreateIndex
CREATE INDEX "EmailCampaign_shop_status_idx" ON "EmailCampaign"("shop", "status");

-- CreateIndex
CREATE INDEX "EmailCampaign_shop_scheduledFor_idx" ON "EmailCampaign"("shop", "scheduledFor");

-- CreateIndex
CREATE INDEX "EmailCampaign_sentAt_idx" ON "EmailCampaign"("sentAt" DESC);

-- CreateIndex
CREATE INDEX "EmailAutomation_shop_trigger_idx" ON "EmailAutomation"("shop", "trigger");

-- CreateIndex
CREATE INDEX "EmailAutomation_shop_isEnabled_idx" ON "EmailAutomation"("shop", "isEnabled");

-- CreateIndex
CREATE INDEX "PendingAutomation_status_executeAt_idx" ON "PendingAutomation"("status", "executeAt");

-- CreateIndex
CREATE INDEX "PendingAutomation_shop_idx" ON "PendingAutomation"("shop");

-- CreateIndex
CREATE INDEX "SendGridDomain_shop_status_idx" ON "SendGridDomain"("shop", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SendGridDomain_shop_domain_key" ON "SendGridDomain"("shop", "domain");

-- CreateIndex
CREATE INDEX "EmailEvent_shop_eventType_createdAt_idx" ON "EmailEvent"("shop", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "EmailEvent_campaignId_eventType_idx" ON "EmailEvent"("campaignId", "eventType");

-- CreateIndex
CREATE INDEX "EmailEvent_customerEmail_eventType_idx" ON "EmailEvent"("customerEmail", "eventType");

-- CreateIndex
CREATE INDEX "AnalyticsRecommendation_shop_status_idx" ON "AnalyticsRecommendation"("shop", "status");

-- CreateIndex
CREATE INDEX "AnalyticsRecommendation_shop_expiresAt_idx" ON "AnalyticsRecommendation"("shop", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsRecommendation_shop_slug_key" ON "AnalyticsRecommendation"("shop", "slug");

-- CreateIndex
CREATE INDEX "KlaviyoProfile_shop_email_idx" ON "KlaviyoProfile"("shop", "email");

-- CreateIndex
CREATE INDEX "KlaviyoProfile_shop_syncStatus_idx" ON "KlaviyoProfile"("shop", "syncStatus");

-- CreateIndex
CREATE INDEX "KlaviyoProfile_shop_syncedAt_idx" ON "KlaviyoProfile"("shop", "syncedAt");

-- CreateIndex
CREATE INDEX "KlaviyoProfile_shop_emailConsent_idx" ON "KlaviyoProfile"("shop", "emailConsent");

-- CreateIndex
CREATE INDEX "KlaviyoProfile_shopifyCustomerId_idx" ON "KlaviyoProfile"("shopifyCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoProfile_shop_customerId_key" ON "KlaviyoProfile"("shop", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoProfile_shop_klaviyoProfileId_key" ON "KlaviyoProfile"("shop", "klaviyoProfileId");

-- CreateIndex
CREATE INDEX "KlaviyoEvent_shop_eventType_createdAt_idx" ON "KlaviyoEvent"("shop", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "KlaviyoEvent_shop_status_idx" ON "KlaviyoEvent"("shop", "status");

-- CreateIndex
CREATE INDEX "KlaviyoEvent_customerId_eventType_idx" ON "KlaviyoEvent"("customerId", "eventType");

-- CreateIndex
CREATE INDEX "KlaviyoEvent_orderId_idx" ON "KlaviyoEvent"("orderId");

-- CreateIndex
CREATE INDEX "KlaviyoEvent_nextRetryAt_idx" ON "KlaviyoEvent"("nextRetryAt");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoEvent_shop_uniqueId_key" ON "KlaviyoEvent"("shop", "uniqueId");

-- CreateIndex
CREATE INDEX "KlaviyoList_shop_isDefault_idx" ON "KlaviyoList"("shop", "isDefault");

-- CreateIndex
CREATE INDEX "KlaviyoList_shop_purpose_idx" ON "KlaviyoList"("shop", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoList_shop_klaviyoListId_key" ON "KlaviyoList"("shop", "klaviyoListId");

-- CreateIndex
CREATE UNIQUE INDEX "KlaviyoAutomationSettings_shop_key" ON "KlaviyoAutomationSettings"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "PointsConfig_shop_key" ON "PointsConfig"("shop");

-- CreateIndex
CREATE INDEX "PointsConfig_shop_idx" ON "PointsConfig"("shop");

-- CreateIndex
CREATE INDEX "PointsLedger_shop_customerId_idx" ON "PointsLedger"("shop", "customerId");

-- CreateIndex
CREATE INDEX "PointsLedger_raffleEntryId_idx" ON "PointsLedger"("raffleEntryId");

-- CreateIndex
CREATE INDEX "PointsLedger_customerId_createdAt_idx" ON "PointsLedger"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointsLedger_type_idx" ON "PointsLedger"("type");

-- CreateIndex
CREATE INDEX "PointsLedger_expiresAt_expired_idx" ON "PointsLedger"("expiresAt", "expired");

-- CreateIndex
CREATE INDEX "PointsLedger_shop_createdAt_idx" ON "PointsLedger"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Raffle_shop_idx" ON "Raffle"("shop");

-- CreateIndex
CREATE INDEX "Raffle_shop_status_idx" ON "Raffle"("shop", "status");

-- CreateIndex
CREATE INDEX "Raffle_status_startsAt_idx" ON "Raffle"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Raffle_status_endsAt_idx" ON "Raffle"("status", "endsAt");

-- CreateIndex
CREATE INDEX "RafflePrize_raffleId_idx" ON "RafflePrize"("raffleId");

-- CreateIndex
CREATE INDEX "RafflePrize_raffleId_displayOrder_idx" ON "RafflePrize"("raffleId", "displayOrder");

-- CreateIndex
CREATE INDEX "RaffleEntry_raffleId_idx" ON "RaffleEntry"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleEntry_customerId_idx" ON "RaffleEntry"("customerId");

-- CreateIndex
CREATE INDEX "RaffleEntry_shop_customerId_idx" ON "RaffleEntry"("shop", "customerId");

-- CreateIndex
CREATE INDEX "RaffleEntry_raffleId_isWinner_idx" ON "RaffleEntry"("raffleId", "isWinner");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleEntry_raffleId_customerId_key" ON "RaffleEntry"("raffleId", "customerId");

-- CreateIndex
CREATE INDEX "RaffleWinner_raffleId_idx" ON "RaffleWinner"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleWinner_customerId_idx" ON "RaffleWinner"("customerId");

-- CreateIndex
CREATE INDEX "RaffleWinner_shop_customerId_idx" ON "RaffleWinner"("shop", "customerId");

-- CreateIndex
CREATE INDEX "RaffleWinner_deliveryStatus_idx" ON "RaffleWinner"("deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleWinner_raffleId_winPosition_key" ON "RaffleWinner"("raffleId", "winPosition");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleStreak_customerId_key" ON "RaffleStreak"("customerId");

-- CreateIndex
CREATE INDEX "RaffleStreak_shop_customerId_idx" ON "RaffleStreak"("shop", "customerId");

-- CreateIndex
CREATE INDEX "RaffleStreak_shop_currentStreak_idx" ON "RaffleStreak"("shop", "currentStreak");

-- CreateIndex
CREATE INDEX "RaffleStreak_lastEntryDate_idx" ON "RaffleStreak"("lastEntryDate");

-- CreateIndex
CREATE INDEX "RaffleInstantWin_raffleId_isActive_idx" ON "RaffleInstantWin"("raffleId", "isActive");

-- CreateIndex
CREATE INDEX "RaffleInstantWin_shop_idx" ON "RaffleInstantWin"("shop");

-- CreateIndex
CREATE INDEX "RaffleInstantWinLog_instantWinId_idx" ON "RaffleInstantWinLog"("instantWinId");

-- CreateIndex
CREATE INDEX "RaffleInstantWinLog_customerId_idx" ON "RaffleInstantWinLog"("customerId");

-- CreateIndex
CREATE INDEX "RaffleInstantWinLog_raffleEntryId_idx" ON "RaffleInstantWinLog"("raffleEntryId");

-- CreateIndex
CREATE INDEX "RaffleInstantWinLog_shop_createdAt_idx" ON "RaffleInstantWinLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "RaffleActivity_raffleId_createdAt_idx" ON "RaffleActivity"("raffleId", "createdAt");

-- CreateIndex
CREATE INDEX "RaffleActivity_shop_createdAt_idx" ON "RaffleActivity"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "RaffleActivity_activityType_idx" ON "RaffleActivity"("activityType");

-- CreateIndex
CREATE INDEX "RaffleBonusEvent_shop_isActive_idx" ON "RaffleBonusEvent"("shop", "isActive");

-- CreateIndex
CREATE INDEX "RaffleBonusEvent_startsAt_endsAt_idx" ON "RaffleBonusEvent"("startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "RaffleBonusEvent_raffleId_idx" ON "RaffleBonusEvent"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleBonusEventUsage_customerId_idx" ON "RaffleBonusEventUsage"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RaffleBonusEventUsage_bonusEventId_customerId_key" ON "RaffleBonusEventUsage"("bonusEventId", "customerId");

-- CreateIndex
CREATE INDEX "RaffleLuckyNumber_raffleId_idx" ON "RaffleLuckyNumber"("raffleId");

-- CreateIndex
CREATE INDEX "RaffleLuckyNumber_customerId_idx" ON "RaffleLuckyNumber"("customerId");

-- CreateIndex
CREATE INDEX "RaffleLuckyNumber_shop_createdAt_idx" ON "RaffleLuckyNumber"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "MysteryBox_shop_idx" ON "MysteryBox"("shop");

-- CreateIndex
CREATE INDEX "MysteryBox_shop_status_idx" ON "MysteryBox"("shop", "status");

-- CreateIndex
CREATE INDEX "MysteryBox_status_startsAt_idx" ON "MysteryBox"("status", "startsAt");

-- CreateIndex
CREATE INDEX "MysteryBox_status_endsAt_idx" ON "MysteryBox"("status", "endsAt");

-- CreateIndex
CREATE INDEX "MysteryBoxReward_boxId_idx" ON "MysteryBoxReward"("boxId");

-- CreateIndex
CREATE INDEX "MysteryBoxReward_boxId_rarity_idx" ON "MysteryBoxReward"("boxId", "rarity");

-- CreateIndex
CREATE INDEX "MysteryBoxOpen_boxId_idx" ON "MysteryBoxOpen"("boxId");

-- CreateIndex
CREATE INDEX "MysteryBoxOpen_customerId_idx" ON "MysteryBoxOpen"("customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxOpen_shop_customerId_idx" ON "MysteryBoxOpen"("shop", "customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxOpen_boxId_customerId_idx" ON "MysteryBoxOpen"("boxId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "MysteryBoxWinner_openId_key" ON "MysteryBoxWinner"("openId");

-- CreateIndex
CREATE INDEX "MysteryBoxWinner_boxId_idx" ON "MysteryBoxWinner"("boxId");

-- CreateIndex
CREATE INDEX "MysteryBoxWinner_customerId_idx" ON "MysteryBoxWinner"("customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxWinner_deliveryStatus_idx" ON "MysteryBoxWinner"("deliveryStatus");

-- CreateIndex
CREATE INDEX "MysteryBoxWinner_shop_deliveryStatus_idx" ON "MysteryBoxWinner"("shop", "deliveryStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MysteryBoxStreak_customerId_key" ON "MysteryBoxStreak"("customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxStreak_shop_customerId_idx" ON "MysteryBoxStreak"("shop", "customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxActivity_boxId_createdAt_idx" ON "MysteryBoxActivity"("boxId", "createdAt");

-- CreateIndex
CREATE INDEX "MysteryBoxActivity_shop_createdAt_idx" ON "MysteryBoxActivity"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "MysteryBoxBonusEvent_shop_isActive_idx" ON "MysteryBoxBonusEvent"("shop", "isActive");

-- CreateIndex
CREATE INDEX "MysteryBoxBonusEvent_shop_startsAt_endsAt_idx" ON "MysteryBoxBonusEvent"("shop", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "MysteryBoxBonusEventUsage_eventId_customerId_idx" ON "MysteryBoxBonusEventUsage"("eventId", "customerId");

-- CreateIndex
CREATE INDEX "MysteryBoxBonusEventUsage_shop_customerId_idx" ON "MysteryBoxBonusEventUsage"("shop", "customerId");

-- CreateIndex
CREATE INDEX "Challenge_shop_idx" ON "Challenge"("shop");

-- CreateIndex
CREATE INDEX "Challenge_shop_status_idx" ON "Challenge"("shop", "status");

-- CreateIndex
CREATE INDEX "Challenge_status_startsAt_idx" ON "Challenge"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Challenge_status_endsAt_idx" ON "Challenge"("status", "endsAt");

-- CreateIndex
CREATE INDEX "Challenge_shop_objectiveType_idx" ON "Challenge"("shop", "objectiveType");

-- CreateIndex
CREATE INDEX "Challenge_shop_cadence_status_idx" ON "Challenge"("shop", "cadence", "status");

-- CreateIndex
CREATE INDEX "Challenge_shop_category_idx" ON "Challenge"("shop", "category");

-- CreateIndex
CREATE INDEX "Challenge_templateId_idx" ON "Challenge"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeReward_challengeId_key" ON "ChallengeReward"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeReward_challengeId_idx" ON "ChallengeReward"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_challengeId_idx" ON "ChallengeParticipant"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_customerId_idx" ON "ChallengeParticipant"("customerId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_shop_customerId_idx" ON "ChallengeParticipant"("shop", "customerId");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_challengeId_status_idx" ON "ChallengeParticipant"("challengeId", "status");

-- CreateIndex
CREATE INDEX "ChallengeParticipant_status_completedAt_idx" ON "ChallengeParticipant"("status", "completedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ChallengeParticipant_challengeId_customerId_key" ON "ChallengeParticipant"("challengeId", "customerId");

-- CreateIndex
CREATE INDEX "ChallengeProgressLog_challengeId_idx" ON "ChallengeProgressLog"("challengeId");

-- CreateIndex
CREATE INDEX "ChallengeProgressLog_participantId_idx" ON "ChallengeProgressLog"("participantId");

-- CreateIndex
CREATE INDEX "ChallengeProgressLog_sourceType_sourceId_idx" ON "ChallengeProgressLog"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "ChallengeProgressLog_createdAt_idx" ON "ChallengeProgressLog"("createdAt");

-- CreateIndex
CREATE INDEX "MissionTemplate_shop_isActive_cadence_idx" ON "MissionTemplate"("shop", "isActive", "cadence");

-- CreateIndex
CREATE INDEX "MissionTemplate_shop_category_idx" ON "MissionTemplate"("shop", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MissionTemplate_shop_name_key" ON "MissionTemplate"("shop", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerMissionStats_customerId_key" ON "CustomerMissionStats"("customerId");

-- CreateIndex
CREATE INDEX "CustomerMissionStats_shop_customerId_idx" ON "CustomerMissionStats"("shop", "customerId");

-- CreateIndex
CREATE INDEX "CustomerMissionStats_shop_currentStreak_idx" ON "CustomerMissionStats"("shop", "currentStreak");

-- CreateIndex
CREATE INDEX "CustomerMissionStats_shop_totalXp_idx" ON "CustomerMissionStats"("shop", "totalXp");

-- CreateIndex
CREATE INDEX "CustomerMissionStats_shop_currentLevel_idx" ON "CustomerMissionStats"("shop", "currentLevel");

-- CreateIndex
CREATE INDEX "MissionCompletionEvent_shop_customerId_acknowledged_idx" ON "MissionCompletionEvent"("shop", "customerId", "acknowledged");

-- CreateIndex
CREATE INDEX "MissionCompletionEvent_createdAt_idx" ON "MissionCompletionEvent"("createdAt");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_shop_idx" ON "ProcessedWebhook"("shop");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_topic_idx" ON "ProcessedWebhook"("topic");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_receivedAt_idx" ON "ProcessedWebhook"("receivedAt");

-- CreateIndex
CREATE INDEX "ProcessedWebhook_status_idx" ON "ProcessedWebhook"("status");

-- CreateIndex
CREATE INDEX "WebhookAuditLog_shop_createdAt_idx" ON "WebhookAuditLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "WebhookAuditLog_webhookId_idx" ON "WebhookAuditLog"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookAuditLog_action_idx" ON "WebhookAuditLog"("action");

-- CreateIndex
CREATE INDEX "ReconciliationLog_shop_createdAt_idx" ON "ReconciliationLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReconciliationLog_action_idx" ON "ReconciliationLog"("action");

-- CreateIndex
CREATE INDEX "ReconciliationLog_mismatchCount_idx" ON "ReconciliationLog"("mismatchCount");

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
ALTER TABLE "ShopSettings" ADD CONSTRAINT "ShopSettings_defaultBaseTierId_fkey" FOREIGN KEY ("defaultBaseTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierProduct" ADD CONSTRAINT "TierProduct_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierProductAuditLog" ADD CONSTRAINT "TierProductAuditLog_tierProductId_fkey" FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_currentTierId_fkey" FOREIGN KEY ("currentTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_currentSubscriptionId_fkey" FOREIGN KEY ("currentSubscriptionId") REFERENCES "TierSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_effectiveTierId_fkey" FOREIGN KEY ("effectiveTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_manualOverrideTierId_fkey" FOREIGN KEY ("manualOverrideTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_spendingBasedTierId_fkey" FOREIGN KEY ("spendingBasedTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerTierState" ADD CONSTRAINT "CustomerTierState_nextTierId_fkey" FOREIGN KEY ("nextTierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCreditLedger" ADD CONSTRAINT "StoreCreditLedger_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCreditLedger" ADD CONSTRAINT "StoreCreditLedger_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreCreditLedger" ADD CONSTRAINT "StoreCreditLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierGiftCardSettings" ADD CONSTRAINT "TierGiftCardSettings_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardBundle" ADD CONSTRAINT "GiftCardBundle_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierChangeLog" ADD CONSTRAINT "TierChangeLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierChangeLog" ADD CONSTRAINT "TierChangeLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierTrialAuditLog" ADD CONSTRAINT "TierTrialAuditLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAttempt" ADD CONSTRAINT "BillingAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_tierProductId_fkey" FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionBillingAttempt" ADD CONSTRAINT "SubscriptionBillingAttempt_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellingPlan" ADD CONSTRAINT "SellingPlan_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "SellingPlanGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TierPurchase" ADD CONSTRAINT "TierPurchase_tierProductId_fkey" FOREIGN KEY ("tierProductId") REFERENCES "TierProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionRetry" ADD CONSTRAINT "SubscriptionRetry_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderLineItem" ADD CONSTRAINT "OrderLineItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderRefundLineItem" ADD CONSTRAINT "OrderRefundLineItem_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailCampaign" ADD CONSTRAINT "EmailCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailAutomation" ADD CONSTRAINT "EmailAutomation_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailSettings" ADD CONSTRAINT "EmailSettings_customDomainId_fkey" FOREIGN KEY ("customDomainId") REFERENCES "SendGridDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_raffleEntryId_fkey" FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RafflePrize" ADD CONSTRAINT "RafflePrize_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_raffleEntryId_fkey" FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_rafflePrizeId_fkey" FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleStreak" ADD CONSTRAINT "RaffleStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleInstantWin" ADD CONSTRAINT "RaffleInstantWin_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_instantWinId_fkey" FOREIGN KEY ("instantWinId") REFERENCES "RaffleInstantWin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_raffleEntryId_fkey" FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBonusEvent" ADD CONSTRAINT "RaffleBonusEvent_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_bonusEventId_fkey" FOREIGN KEY ("bonusEventId") REFERENCES "RaffleBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxReward" ADD CONSTRAINT "MysteryBoxReward_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxOpen" ADD CONSTRAINT "MysteryBoxOpen_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxOpen" ADD CONSTRAINT "MysteryBoxOpen_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxWinner" ADD CONSTRAINT "MysteryBoxWinner_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxWinner" ADD CONSTRAINT "MysteryBoxWinner_openId_fkey" FOREIGN KEY ("openId") REFERENCES "MysteryBoxOpen"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxWinner" ADD CONSTRAINT "MysteryBoxWinner_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "MysteryBoxReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxWinner" ADD CONSTRAINT "MysteryBoxWinner_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxStreak" ADD CONSTRAINT "MysteryBoxStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxBonusEvent" ADD CONSTRAINT "MysteryBoxBonusEvent_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MysteryBoxBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "MissionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeReward" ADD CONSTRAINT "ChallengeReward_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgressLog" ADD CONSTRAINT "ChallengeProgressLog_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChallengeProgressLog" ADD CONSTRAINT "ChallengeProgressLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "ChallengeParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerMissionStats" ADD CONSTRAINT "CustomerMissionStats_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MissionCompletionEvent" ADD CONSTRAINT "MissionCompletionEvent_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "CustomerMissionStats"("customerId") ON DELETE CASCADE ON UPDATE CASCADE;

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

