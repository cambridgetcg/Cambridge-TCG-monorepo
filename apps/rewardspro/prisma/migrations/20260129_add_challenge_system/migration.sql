-- ============================================
-- CHALLENGE SYSTEM MIGRATION
-- Creates core Challenge tables and enums
-- ============================================

-- Create ChallengeStatus Enum
DO $$ BEGIN
    CREATE TYPE "ChallengeStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ChallengeObjectiveType Enum
DO $$ BEGIN
    CREATE TYPE "ChallengeObjectiveType" AS ENUM ('SPENDING', 'ORDER_COUNT', 'REFERRAL', 'PRODUCT_PURCHASE', 'REVIEW', 'STREAK');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ChallengeRewardType Enum
DO $$ BEGIN
    CREATE TYPE "ChallengeRewardType" AS ENUM ('POINTS', 'STORE_CREDIT', 'DISCOUNT', 'TIER_UPGRADE', 'CUSTOM');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create ChallengeParticipantStatus Enum
DO $$ BEGIN
    CREATE TYPE "ChallengeParticipantStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'CLAIMED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- Create Challenge Table
-- ============================================

CREATE TABLE IF NOT EXISTS "Challenge" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Basic Info
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,

    -- Status & Timing
    "status" "ChallengeStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    -- Objective Configuration
    "objectiveType" "ChallengeObjectiveType" NOT NULL,
    "targetValue" INTEGER NOT NULL,
    "objectiveConfig" JSONB,

    -- Access Control
    "tierRestrictions" JSONB,
    "minimumTierId" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT true,

    -- Statistics
    "participantCount" INTEGER NOT NULL DEFAULT 0,
    "completionCount" INTEGER NOT NULL DEFAULT 0,
    "claimCount" INTEGER NOT NULL DEFAULT 0,
    "totalProgress" INTEGER NOT NULL DEFAULT 0,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Challenge_pkey" PRIMARY KEY ("id")
);

-- Challenge Indexes
CREATE INDEX IF NOT EXISTS "Challenge_shop_status_idx" ON "Challenge"("shop", "status");
CREATE INDEX IF NOT EXISTS "Challenge_shop_startsAt_idx" ON "Challenge"("shop", "startsAt");
CREATE INDEX IF NOT EXISTS "Challenge_shop_endsAt_idx" ON "Challenge"("shop", "endsAt");

-- ============================================
-- Create ChallengeReward Table
-- ============================================

CREATE TABLE IF NOT EXISTS "ChallengeReward" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,

    -- Reward Configuration
    "rewardType" "ChallengeRewardType" NOT NULL,
    "rewardValue" JSONB NOT NULL,

    -- Display
    "description" TEXT NOT NULL,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeReward_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChallengeReward_challengeId_key" UNIQUE ("challengeId")
);

-- ChallengeReward Index
CREATE INDEX IF NOT EXISTS "ChallengeReward_challengeId_idx" ON "ChallengeReward"("challengeId");

-- Foreign Key
ALTER TABLE "ChallengeReward" ADD CONSTRAINT "ChallengeReward_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Create ChallengeParticipant Table
-- ============================================

CREATE TABLE IF NOT EXISTS "ChallengeParticipant" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Progress Tracking
    "currentProgress" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,

    -- Status
    "status" "ChallengeParticipantStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "completedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),

    -- Reward Delivery
    "rewardDelivered" BOOLEAN NOT NULL DEFAULT false,
    "rewardDeliveryId" TEXT,
    "rewardDeliveryNotes" TEXT,

    -- Metadata
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeParticipant_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ChallengeParticipant_challengeId_customerId_key" UNIQUE ("challengeId", "customerId")
);

-- ChallengeParticipant Indexes
CREATE INDEX IF NOT EXISTS "ChallengeParticipant_challengeId_idx" ON "ChallengeParticipant"("challengeId");
CREATE INDEX IF NOT EXISTS "ChallengeParticipant_customerId_idx" ON "ChallengeParticipant"("customerId");
CREATE INDEX IF NOT EXISTS "ChallengeParticipant_shop_status_idx" ON "ChallengeParticipant"("shop", "status");

-- Foreign Keys
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeParticipant" ADD CONSTRAINT "ChallengeParticipant_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Create ChallengeProgressLog Table
-- ============================================

CREATE TABLE IF NOT EXISTS "ChallengeProgressLog" (
    "id" TEXT NOT NULL,
    "challengeId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Progress Details
    "progressDelta" INTEGER NOT NULL,
    "newProgress" INTEGER NOT NULL,
    "newProgressPercent" INTEGER NOT NULL,

    -- Source Reference
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,

    -- Metadata
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChallengeProgressLog_pkey" PRIMARY KEY ("id")
);

-- ChallengeProgressLog Indexes
CREATE INDEX IF NOT EXISTS "ChallengeProgressLog_challengeId_idx" ON "ChallengeProgressLog"("challengeId");
CREATE INDEX IF NOT EXISTS "ChallengeProgressLog_participantId_idx" ON "ChallengeProgressLog"("participantId");
CREATE INDEX IF NOT EXISTS "ChallengeProgressLog_sourceType_sourceId_idx" ON "ChallengeProgressLog"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "ChallengeProgressLog_createdAt_idx" ON "ChallengeProgressLog"("createdAt");

-- Foreign Keys
ALTER TABLE "ChallengeProgressLog" ADD CONSTRAINT "ChallengeProgressLog_challengeId_fkey"
    FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChallengeProgressLog" ADD CONSTRAINT "ChallengeProgressLog_participantId_fkey"
    FOREIGN KEY ("participantId") REFERENCES "ChallengeParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- Migration Complete
-- ============================================
