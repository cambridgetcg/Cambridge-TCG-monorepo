-- Raffles System Migration
-- This migration adds tables for the Points-based Raffles engagement system

-- ============================================
-- CREATE ENUMS
-- ============================================

-- Raffle status lifecycle
CREATE TYPE "RaffleStatus" AS ENUM (
    'DRAFT',
    'SCHEDULED',
    'ACTIVE',
    'CLOSED',
    'DRAWING',
    'COMPLETED',
    'CANCELLED'
);

-- How winners are selected
CREATE TYPE "RaffleDrawType" AS ENUM (
    'RANDOM',
    'WEIGHTED',
    'FIFO'
);

-- Types of prizes that can be won
CREATE TYPE "RafflePrizeType" AS ENUM (
    'DISCOUNT',
    'STORE_CREDIT',
    'PRODUCT',
    'POINTS',
    'CUSTOM'
);

-- Prize delivery status
CREATE TYPE "RafflePrizeDeliveryStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'DELIVERED',
    'FAILED',
    'CLAIMED'
);

-- ============================================
-- CREATE RAFFLE TABLE
-- ============================================

CREATE TABLE "Raffle" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Basic Info
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,

    -- Status & Timing
    "status" "RaffleStatus" NOT NULL DEFAULT 'DRAFT',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "drawAt" TIMESTAMP(3),
    "drawnAt" TIMESTAMP(3),

    -- Entry Rules
    "entryCost" INTEGER NOT NULL DEFAULT 100,
    "maxEntriesTotal" INTEGER,
    "maxEntriesPerCustomer" INTEGER NOT NULL DEFAULT 10,

    -- Draw Configuration
    "drawType" "RaffleDrawType" NOT NULL DEFAULT 'RANDOM',
    "totalWinners" INTEGER NOT NULL DEFAULT 1,

    -- Entry Stats (denormalized for performance)
    "totalEntries" INTEGER NOT NULL DEFAULT 0,
    "uniqueEntrants" INTEGER NOT NULL DEFAULT 0,
    "totalPrizePool" INTEGER NOT NULL DEFAULT 0,

    -- Visibility & Eligibility
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "tierRestrictions" JSONB,
    "minimumTier" TEXT,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Raffle_pkey" PRIMARY KEY ("id")
);

-- Create indexes for Raffle
CREATE INDEX "Raffle_shop_idx" ON "Raffle"("shop");
CREATE INDEX "Raffle_shop_status_idx" ON "Raffle"("shop", "status");
CREATE INDEX "Raffle_status_startsAt_idx" ON "Raffle"("status", "startsAt");
CREATE INDEX "Raffle_status_endsAt_idx" ON "Raffle"("status", "endsAt");

-- ============================================
-- CREATE RAFFLE PRIZE TABLE
-- ============================================

CREATE TABLE "RafflePrize" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,

    -- Prize Details
    "name" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,

    -- Prize Type & Value
    "prizeType" "RafflePrizeType" NOT NULL,
    "prizeValue" JSONB NOT NULL,

    -- Distribution
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "quantityWon" INTEGER NOT NULL DEFAULT 0,
    "displayOrder" INTEGER NOT NULL DEFAULT 0,

    -- Odds Configuration (for WEIGHTED draw type)
    "weight" INTEGER NOT NULL DEFAULT 100,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RafflePrize_pkey" PRIMARY KEY ("id")
);

-- Create indexes for RafflePrize
CREATE INDEX "RafflePrize_raffleId_idx" ON "RafflePrize"("raffleId");
CREATE INDEX "RafflePrize_raffleId_displayOrder_idx" ON "RafflePrize"("raffleId", "displayOrder");

-- Add foreign key to Raffle
ALTER TABLE "RafflePrize" ADD CONSTRAINT "RafflePrize_raffleId_fkey"
    FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- CREATE RAFFLE ENTRY TABLE
-- ============================================

CREATE TABLE "RaffleEntry" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Entry Details
    "entriesCount" INTEGER NOT NULL DEFAULT 1,
    "pointsSpent" INTEGER NOT NULL,
    "entryMultiplier" DECIMAL(3,2) NOT NULL DEFAULT 1.0,

    -- Tracking
    "isWinner" BOOLEAN NOT NULL DEFAULT false,

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RaffleEntry_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint (one entry record per customer per raffle)
CREATE UNIQUE INDEX "RaffleEntry_raffleId_customerId_key" ON "RaffleEntry"("raffleId", "customerId");

-- Create indexes for RaffleEntry
CREATE INDEX "RaffleEntry_raffleId_idx" ON "RaffleEntry"("raffleId");
CREATE INDEX "RaffleEntry_customerId_idx" ON "RaffleEntry"("customerId");
CREATE INDEX "RaffleEntry_shop_customerId_idx" ON "RaffleEntry"("shop", "customerId");
CREATE INDEX "RaffleEntry_raffleId_isWinner_idx" ON "RaffleEntry"("raffleId", "isWinner");

-- Add foreign keys
ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_raffleId_fkey"
    FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RaffleEntry" ADD CONSTRAINT "RaffleEntry_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- CREATE RAFFLE WINNER TABLE
-- ============================================

CREATE TABLE "RaffleWinner" (
    "id" TEXT NOT NULL,
    "raffleId" TEXT NOT NULL,
    "raffleEntryId" TEXT NOT NULL,
    "rafflePrizeId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,

    -- Win Details
    "winPosition" INTEGER NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- Prize Delivery
    "deliveryStatus" "RafflePrizeDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "deliveredAt" TIMESTAMP(3),
    "deliveryNotes" TEXT,

    -- Prize-specific delivery details
    "discountCode" TEXT,
    "storeCreditId" TEXT,
    "pointsLedgerId" TEXT,

    -- Notification Tracking
    "notifiedAt" TIMESTAMP(3),
    "notifyAttempts" INTEGER NOT NULL DEFAULT 0,
    "claimedAt" TIMESTAMP(3),

    -- Metadata
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RaffleWinner_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint (one winner per position per raffle)
CREATE UNIQUE INDEX "RaffleWinner_raffleId_winPosition_key" ON "RaffleWinner"("raffleId", "winPosition");

-- Create indexes for RaffleWinner
CREATE INDEX "RaffleWinner_raffleId_idx" ON "RaffleWinner"("raffleId");
CREATE INDEX "RaffleWinner_customerId_idx" ON "RaffleWinner"("customerId");
CREATE INDEX "RaffleWinner_shop_customerId_idx" ON "RaffleWinner"("shop", "customerId");
CREATE INDEX "RaffleWinner_deliveryStatus_idx" ON "RaffleWinner"("deliveryStatus");

-- Add foreign keys
ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_raffleId_fkey"
    FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_raffleEntryId_fkey"
    FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_rafflePrizeId_fkey"
    FOREIGN KEY ("rafflePrizeId") REFERENCES "RafflePrize"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RaffleWinner" ADD CONSTRAINT "RaffleWinner_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================
-- UPDATE POINTS LEDGER TABLE
-- ============================================

-- Add foreign key from PointsLedger to RaffleEntry (for tracking raffle entry purchases)
ALTER TABLE "PointsLedger" ADD CONSTRAINT "PointsLedger_raffleEntryId_fkey"
    FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Add index for raffleEntryId lookups
CREATE INDEX IF NOT EXISTS "PointsLedger_raffleEntryId_idx" ON "PointsLedger"("raffleEntryId");
