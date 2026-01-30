-- ============================================
-- MISSION SYSTEM MIGRATION
-- Gamification for Challenges Module
-- ============================================

-- Add Mission System Enums
DO $$ BEGIN
    CREATE TYPE "MissionCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'SPECIAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "MissionRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "MissionCategory" AS ENUM ('SHOPPING', 'DISCOVERY', 'SOCIAL', 'STREAK', 'CHALLENGE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "MissionEventType" AS ENUM ('COMPLETE', 'CLAIM', 'MILESTONE', 'STREAK', 'COMBO', 'LEVEL_UP');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Add Mission Fields to Challenge Table
-- ============================================

-- Mission Cadence
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "cadence" "MissionCadence" NOT NULL DEFAULT 'SPECIAL';

-- Gamification Attributes
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "rarity" "MissionRarity" NOT NULL DEFAULT 'COMMON';
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "category" "MissionCategory" NOT NULL DEFAULT 'CHALLENGE';
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "xpReward" INTEGER NOT NULL DEFAULT 10;

-- Template Reference
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "templateId" TEXT;

-- Streak/Combo Eligibility
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "comboEligible" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "streakEligible" BOOLEAN NOT NULL DEFAULT true;

-- Display Customization
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "iconEmoji" TEXT DEFAULT '🎯';
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Scheduling
ALTER TABLE "Challenge" ADD COLUMN IF NOT EXISTS "nextResetAt" TIMESTAMP(3);

-- Add indexes for Challenge mission fields
CREATE INDEX IF NOT EXISTS "Challenge_shop_cadence_status_idx" ON "Challenge"("shop", "cadence", "status");
CREATE INDEX IF NOT EXISTS "Challenge_shop_category_idx" ON "Challenge"("shop", "category");
CREATE INDEX IF NOT EXISTS "Challenge_templateId_idx" ON "Challenge"("templateId");

-- ============================================
-- Create MissionTemplate Table
-- ============================================

CREATE TABLE IF NOT EXISTS "MissionTemplate" (
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

-- Add unique constraint and indexes for MissionTemplate
ALTER TABLE "MissionTemplate" ADD CONSTRAINT "MissionTemplate_shop_name_key" UNIQUE ("shop", "name");
CREATE INDEX IF NOT EXISTS "MissionTemplate_shop_isActive_cadence_idx" ON "MissionTemplate"("shop", "isActive", "cadence");
CREATE INDEX IF NOT EXISTS "MissionTemplate_shop_category_idx" ON "MissionTemplate"("shop", "category");

-- Add foreign key from Challenge to MissionTemplate
ALTER TABLE "Challenge" ADD CONSTRAINT "Challenge_templateId_fkey"
    FOREIGN KEY ("templateId") REFERENCES "MissionTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ============================================
-- Create CustomerMissionStats Table
-- ============================================

CREATE TABLE IF NOT EXISTS "CustomerMissionStats" (
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

-- Add unique constraint and indexes for CustomerMissionStats
ALTER TABLE "CustomerMissionStats" ADD CONSTRAINT "CustomerMissionStats_customerId_key" UNIQUE ("customerId");
CREATE INDEX IF NOT EXISTS "CustomerMissionStats_shop_customerId_idx" ON "CustomerMissionStats"("shop", "customerId");
CREATE INDEX IF NOT EXISTS "CustomerMissionStats_shop_currentStreak_idx" ON "CustomerMissionStats"("shop", "currentStreak");
CREATE INDEX IF NOT EXISTS "CustomerMissionStats_shop_totalXp_idx" ON "CustomerMissionStats"("shop", "totalXp");
CREATE INDEX IF NOT EXISTS "CustomerMissionStats_shop_currentLevel_idx" ON "CustomerMissionStats"("shop", "currentLevel");

-- Add foreign key from CustomerMissionStats to Customer
ALTER TABLE "CustomerMissionStats" ADD CONSTRAINT "CustomerMissionStats_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Create MissionCompletionEvent Table
-- ============================================

CREATE TABLE IF NOT EXISTS "MissionCompletionEvent" (
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

-- Add indexes for MissionCompletionEvent
CREATE INDEX IF NOT EXISTS "MissionCompletionEvent_shop_customerId_acknowledged_idx" ON "MissionCompletionEvent"("shop", "customerId", "acknowledged");
CREATE INDEX IF NOT EXISTS "MissionCompletionEvent_createdAt_idx" ON "MissionCompletionEvent"("createdAt");

-- Add foreign key from MissionCompletionEvent to CustomerMissionStats
ALTER TABLE "MissionCompletionEvent" ADD CONSTRAINT "MissionCompletionEvent_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "CustomerMissionStats"("customerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Update PointsConfig with Mission Settings
-- ============================================

-- Master Toggle
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "missionsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- XP Configuration
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "xpEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "xpPerLevel" INTEGER NOT NULL DEFAULT 100;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "xpLevelScaling" DECIMAL(3,2) NOT NULL DEFAULT 1.2;

-- Mission Streak Configuration
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "missionStreakBonusEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "missionStreakBonusPercent" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "maxMissionStreakBonus" INTEGER NOT NULL DEFAULT 100;

-- Mission Combo Configuration
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "comboEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "comboBonusPercent" INTEGER NOT NULL DEFAULT 25;
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "maxComboBonus" INTEGER NOT NULL DEFAULT 100;

-- Mission Reset Time
ALTER TABLE "PointsConfig" ADD COLUMN IF NOT EXISTS "missionResetHour" INTEGER NOT NULL DEFAULT 0;

-- ============================================
-- Migration Complete
-- ============================================
