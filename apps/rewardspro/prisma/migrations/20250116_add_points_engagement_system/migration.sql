-- Points Engagement System Migration
-- This migration adds the foundational tables for the Points Engagement System

-- ============================================
-- CREATE ENUMS
-- ============================================

-- Points rounding mode enum
CREATE TYPE "PointsRoundingMode" AS ENUM ('FLOOR', 'CEIL', 'ROUND');

-- Points ledger transaction type enum
CREATE TYPE "PointsLedgerType" AS ENUM (
    'ORDER_EARNED',
    'CHALLENGE_COMPLETED',
    'SPIN_WHEEL_WIN',
    'SCRATCH_CARD_WIN',
    'MYSTERY_BOX_WIN',
    'BONUS_EVENT',
    'REFERRAL_BONUS',
    'MANUAL_CREDIT',
    'STREAK_BONUS',
    'RAFFLE_ENTRY',
    'MYSTERY_BOX_OPEN',
    'PREMIUM_SPIN',
    'GIVEBACK_DONATION',
    'MANUAL_DEBIT',
    'EXPIRATION',
    'REFUND_CLAWBACK',
    'SYSTEM_ADJUSTMENT'
);

-- ============================================
-- ADD COLUMNS TO EXISTING TABLES
-- ============================================

-- Add points multiplier columns to Tier table
ALTER TABLE "Tier" ADD COLUMN IF NOT EXISTS "pointsMultiplier" DECIMAL(3,2) DEFAULT 1.0;
ALTER TABLE "Tier" ADD COLUMN IF NOT EXISTS "pointsLuckBonus" DECIMAL(5,2) DEFAULT 0;
ALTER TABLE "Tier" ADD COLUMN IF NOT EXISTS "raffleEntryMultiplier" DECIMAL(3,2) DEFAULT 1.0;

-- Add points balance columns to Customer table
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "pointsBalance" DECIMAL(10,2) DEFAULT 0;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "lifetimePoints" DECIMAL(10,2) DEFAULT 0;

-- ============================================
-- CREATE POINTS CONFIG TABLE
-- ============================================

CREATE TABLE "PointsConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- System Enable/Disable
    "isEnabled" BOOLEAN NOT NULL DEFAULT false,

    -- Currency Branding
    "currencyName" TEXT NOT NULL DEFAULT 'Points',
    "currencyNamePlural" TEXT NOT NULL DEFAULT 'Points',
    "currencyIcon" TEXT NOT NULL DEFAULT '⭐',

    -- Earning Rules
    "pointsPerDollar" INTEGER NOT NULL DEFAULT 10,
    "roundingMode" "PointsRoundingMode" NOT NULL DEFAULT 'FLOOR',

    -- Expiration Settings
    "pointsExpire" BOOLEAN NOT NULL DEFAULT false,
    "expirationDays" INTEGER NOT NULL DEFAULT 365,
    "expirationWarningDays" INTEGER NOT NULL DEFAULT 30,

    -- Feature Toggles
    "rafflesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mysteryBoxesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "spinWheelEnabled" BOOLEAN NOT NULL DEFAULT false,
    "challengesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "scratchCardsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "givebackPoolsEnabled" BOOLEAN NOT NULL DEFAULT false,

    -- Daily Spin Wheel Settings
    "dailySpinEnabled" BOOLEAN NOT NULL DEFAULT true,
    "dailySpinResetHour" INTEGER NOT NULL DEFAULT 0,
    "premiumSpinCost" INTEGER NOT NULL DEFAULT 500,

    -- Streak Tracking
    "streakBonusEnabled" BOOLEAN NOT NULL DEFAULT false,
    "streakBonusMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 0.1,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsConfig_pkey" PRIMARY KEY ("id")
);

-- Create unique index on shop
CREATE UNIQUE INDEX "PointsConfig_shop_key" ON "PointsConfig"("shop");

-- Create index on shop for lookups
CREATE INDEX "PointsConfig_shop_idx" ON "PointsConfig"("shop");

-- ============================================
-- CREATE POINTS LEDGER TABLE
-- ============================================

CREATE TABLE "PointsLedger" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,

    -- Transaction Details
    "amount" INTEGER NOT NULL,
    "balance" INTEGER NOT NULL,
    "type" "PointsLedgerType" NOT NULL,

    -- Source Reference (polymorphic - only one should be set)
    "orderId" TEXT,
    "raffleEntryId" TEXT,
    "mysteryBoxOpenId" TEXT,
    "spinResultId" TEXT,
    "challengeId" TEXT,
    "scratchCardId" TEXT,
    "bonusEventId" TEXT,

    -- Expiration Tracking
    "expiresAt" TIMESTAMP(3),
    "expired" BOOLEAN NOT NULL DEFAULT false,

    -- Descriptive
    "description" TEXT,
    "metadata" JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedger_pkey" PRIMARY KEY ("id")
);

-- Create indexes for PointsLedger
CREATE INDEX "PointsLedger_shop_customerId_idx" ON "PointsLedger"("shop", "customerId");
CREATE INDEX "PointsLedger_customerId_createdAt_idx" ON "PointsLedger"("customerId", "createdAt" DESC);
CREATE INDEX "PointsLedger_type_idx" ON "PointsLedger"("type");
CREATE INDEX "PointsLedger_expiresAt_expired_idx" ON "PointsLedger"("expiresAt", "expired");
CREATE INDEX "PointsLedger_shop_createdAt_idx" ON "PointsLedger"("shop", "createdAt" DESC);

-- Add foreign key constraint to Customer table
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
