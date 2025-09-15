-- ============================================
-- Add Subscription System to RewardsPro
-- Migration: add_subscription_system
-- Date: 2025-01-15
-- ============================================

-- Add new columns to existing tables
ALTER TABLE "Tier" ADD COLUMN IF NOT EXISTS "subscriptions" INTEGER DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "subscriptions" INTEGER DEFAULT 0;
ALTER TABLE "TierChangeLog" ADD COLUMN IF NOT EXISTS "subscriptionId" TEXT;

-- Create new enums for subscription system
CREATE TYPE "SubscriptionStatus" AS ENUM (
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'CANCELLED',
  'EXPIRED',
  'FAILED'
);

CREATE TYPE "BillingInterval" AS ENUM (
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'SEMIANNUAL',
  'ANNUAL'
);

CREATE TYPE "BillingStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'CANCELLED',
  'REQUIRES_ACTION'
);

CREATE TYPE "DiscountType" AS ENUM (
  'PERCENTAGE',
  'FIXED_AMOUNT'
);

-- Update TierTriggerType enum to include subscription triggers
ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_STARTED';
ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_RENEWED';
ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_UPGRADED';
ALTER TYPE "TierTriggerType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_DOWNGRADED';

-- ============================================
-- Create TierSubscription table
-- ============================================
CREATE TABLE "TierSubscription" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "shop" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "tierId" TEXT NOT NULL,
  
  -- Shopify Integration
  "subscriptionContractId" TEXT NOT NULL,
  "sellingPlanId" TEXT NOT NULL,
  "sellingPlanGroupId" TEXT NOT NULL,
  "productVariantId" TEXT NOT NULL,
  
  -- Subscription Details
  "status" "SubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "billingInterval" "BillingInterval" NOT NULL,
  "deliveryInterval" "BillingInterval" NOT NULL,
  
  -- Pricing
  "basePrice" DECIMAL(10,2) NOT NULL,
  "discountPercentage" INTEGER NOT NULL DEFAULT 0,
  "finalPrice" DECIMAL(10,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'USD',
  
  -- Period Tracking
  "currentPeriodStart" TIMESTAMP(3) NOT NULL,
  "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
  "nextBillingDate" TIMESTAMP(3),
  "lastBillingDate" TIMESTAMP(3),
  
  -- Lifecycle
  "trialEndsAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "pausedAt" TIMESTAMP(3),
  "resumedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "cancellationReason" TEXT,
  
  -- Billing
  "failedPaymentCount" INTEGER NOT NULL DEFAULT 0,
  
  -- Metadata
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "TierSubscription_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for Shopify contract ID
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_subscriptionContractId_key" UNIQUE ("subscriptionContractId");

-- Add foreign key constraints
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_customerId_fkey" 
  FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  
ALTER TABLE "TierSubscription" ADD CONSTRAINT "TierSubscription_tierId_fkey" 
  FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create indexes for TierSubscription
CREATE INDEX "TierSubscription_shop_customerId_idx" ON "TierSubscription"("shop", "customerId");
CREATE INDEX "TierSubscription_shop_status_idx" ON "TierSubscription"("shop", "status");
CREATE INDEX "TierSubscription_subscriptionContractId_idx" ON "TierSubscription"("subscriptionContractId");
CREATE INDEX "TierSubscription_status_nextBillingDate_idx" ON "TierSubscription"("status", "nextBillingDate");

-- ============================================
-- Create SubscriptionBillingAttempt table
-- ============================================
CREATE TABLE "SubscriptionBillingAttempt" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "subscriptionId" TEXT NOT NULL,
  
  -- Attempt Details
  "attemptNumber" INTEGER NOT NULL DEFAULT 1,
  "idempotencyKey" TEXT NOT NULL,
  
  -- Status
  "status" "BillingStatus" NOT NULL DEFAULT 'PENDING',
  
  -- Financial
  "amount" DECIMAL(10,2) NOT NULL,
  "currency" "Currency" NOT NULL DEFAULT 'USD',
  
  -- Shopify References
  "shopifyOrderId" TEXT,
  "shopifyBillingAttemptId" TEXT,
  "shopifyInvoiceUrl" TEXT,
  
  -- Error Tracking
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "errorDetails" JSONB,
  
  -- Timestamps
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "attemptedAt" TIMESTAMP(3),
  "succeededAt" TIMESTAMP(3),
  "failedAt" TIMESTAMP(3),
  
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "SubscriptionBillingAttempt_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for idempotency
ALTER TABLE "SubscriptionBillingAttempt" ADD CONSTRAINT "SubscriptionBillingAttempt_idempotencyKey_key" UNIQUE ("idempotencyKey");

-- Add foreign key constraint
ALTER TABLE "SubscriptionBillingAttempt" ADD CONSTRAINT "SubscriptionBillingAttempt_subscriptionId_fkey" 
  FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for SubscriptionBillingAttempt
CREATE INDEX "SubscriptionBillingAttempt_subscriptionId_status_idx" ON "SubscriptionBillingAttempt"("subscriptionId", "status");
CREATE INDEX "SubscriptionBillingAttempt_scheduledFor_idx" ON "SubscriptionBillingAttempt"("scheduledFor");
CREATE INDEX "SubscriptionBillingAttempt_idempotencyKey_idx" ON "SubscriptionBillingAttempt"("idempotencyKey");

-- ============================================
-- Create SellingPlanGroup table
-- ============================================
CREATE TABLE "SellingPlanGroup" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "shop" TEXT NOT NULL,
  "shopifyGroupId" TEXT NOT NULL,
  
  -- Configuration
  "name" TEXT NOT NULL,
  "merchantCode" TEXT NOT NULL,
  
  -- Associated Products
  "tierProducts" JSONB NOT NULL,
  
  -- Metadata
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "SellingPlanGroup_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for Shopify group ID
ALTER TABLE "SellingPlanGroup" ADD CONSTRAINT "SellingPlanGroup_shopifyGroupId_key" UNIQUE ("shopifyGroupId");

-- Create indexes for SellingPlanGroup
CREATE INDEX "SellingPlanGroup_shop_idx" ON "SellingPlanGroup"("shop");
CREATE INDEX "SellingPlanGroup_shopifyGroupId_idx" ON "SellingPlanGroup"("shopifyGroupId");

-- ============================================
-- Create SellingPlan table
-- ============================================
CREATE TABLE "SellingPlan" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "groupId" TEXT NOT NULL,
  "shopifyPlanId" TEXT NOT NULL,
  
  -- Plan Details
  "name" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  
  -- Billing Configuration
  "billingInterval" "BillingInterval" NOT NULL,
  "intervalCount" INTEGER NOT NULL DEFAULT 1,
  
  -- Pricing
  "discountType" "DiscountType",
  "discountValue" DECIMAL(10,2),
  
  -- Options
  "options" JSONB NOT NULL,
  
  -- Metadata
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  CONSTRAINT "SellingPlan_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint for Shopify plan ID
ALTER TABLE "SellingPlan" ADD CONSTRAINT "SellingPlan_shopifyPlanId_key" UNIQUE ("shopifyPlanId");

-- Add foreign key constraint
ALTER TABLE "SellingPlan" ADD CONSTRAINT "SellingPlan_groupId_fkey" 
  FOREIGN KEY ("groupId") REFERENCES "SellingPlanGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for SellingPlan
CREATE INDEX "SellingPlan_groupId_idx" ON "SellingPlan"("groupId");
CREATE INDEX "SellingPlan_shopifyPlanId_idx" ON "SellingPlan"("shopifyPlanId");

-- ============================================
-- Add foreign key for TierChangeLog subscription reference
-- ============================================
ALTER TABLE "TierChangeLog" ADD CONSTRAINT "TierChangeLog_subscriptionId_fkey" 
  FOREIGN KEY ("subscriptionId") REFERENCES "TierSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Add update trigger for updatedAt columns
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tier_subscription_updated_at BEFORE UPDATE ON "TierSubscription"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_selling_plan_group_updated_at BEFORE UPDATE ON "SellingPlanGroup"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Add comments for documentation
-- ============================================
COMMENT ON TABLE "TierSubscription" IS 'Manages recurring tier membership subscriptions through Shopify Subscription APIs';
COMMENT ON TABLE "SubscriptionBillingAttempt" IS 'Tracks billing attempts for subscriptions with idempotency';
COMMENT ON TABLE "SellingPlanGroup" IS 'Shopify selling plan groups for tier products';
COMMENT ON TABLE "SellingPlan" IS 'Individual selling plans (monthly, quarterly, annual) within a group';

COMMENT ON COLUMN "TierSubscription"."subscriptionContractId" IS 'Unique Shopify subscription contract ID';
COMMENT ON COLUMN "TierSubscription"."failedPaymentCount" IS 'Track failed payments for suspension logic';
COMMENT ON COLUMN "SubscriptionBillingAttempt"."idempotencyKey" IS 'Prevents duplicate billing attempts';
COMMENT ON COLUMN "SellingPlanGroup"."tierProducts" IS 'JSON array of associated product/variant IDs';

-- ============================================
-- End of migration
-- ============================================