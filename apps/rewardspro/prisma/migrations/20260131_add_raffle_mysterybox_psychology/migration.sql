-- Add Raffle and Mystery Box Psychology Models
-- Includes: streaks, instant wins, activities, bonus events, lucky numbers

-- ============================================
-- NEW ENUMS
-- ============================================

-- Raffle activity types for social proof feed
CREATE TYPE "RaffleActivityType" AS ENUM (
    'ENTRY_PURCHASED',
    'INSTANT_WIN',
    'GRAND_WINNER',
    'STREAK_MILESTONE',
    'EARLY_BIRD',
    'LUCKY_NUMBER'
);

-- Raffle bonus event types
CREATE TYPE "RaffleBonusEventType" AS ENUM (
    'HAPPY_HOUR',
    'FLASH_BONUS',
    'EARLY_BIRD',
    'LAST_CHANCE',
    'MILESTONE'
);

-- Mystery box activity types for social proof feed
CREATE TYPE "MysteryBoxActivityType" AS ENUM (
    'BOX_OPENED',
    'RARE_WIN',
    'EPIC_WIN',
    'LEGENDARY_WIN',
    'STREAK_MILESTONE',
    'PITY_TRIGGERED',
    'LUCKY_STREAK',
    'FREE_OPEN_CLAIMED'
);

-- Mystery box bonus event types
CREATE TYPE "MysteryBoxBonusEventType" AS ENUM (
    'HAPPY_HOUR',
    'FLASH_DISCOUNT',
    'DOUBLE_REWARDS',
    'LUCKY_HOUR',
    'LAST_CHANCE'
);

-- ============================================
-- RAFFLE PSYCHOLOGY TABLES
-- ============================================

-- Tracks customer raffle engagement streaks
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

-- Instant-win micro-prizes during entry purchase
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

-- Log of instant-win occurrences
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

-- Activity feed for social proof
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

-- Bonus entry events (happy hours, flash sales)
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

-- Tracks usage of bonus events per customer
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

-- Lucky number tracking and rewards
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

-- ============================================
-- MYSTERY BOX PSYCHOLOGY TABLES
-- ============================================

-- Tracks customer mystery box engagement streaks and pity system
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

-- Activity feed for social proof
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

-- Bonus events (happy hours, flash discounts)
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

-- Track bonus event usage per customer
CREATE TABLE "MysteryBoxBonusEventUsage" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MysteryBoxBonusEventUsage_pkey" PRIMARY KEY ("id")
);

-- ============================================
-- UNIQUE CONSTRAINTS
-- ============================================

-- RaffleStreak: One streak record per customer
CREATE UNIQUE INDEX "RaffleStreak_customerId_key" ON "RaffleStreak"("customerId");

-- RaffleBonusEventUsage: One record per customer per event
CREATE UNIQUE INDEX "RaffleBonusEventUsage_bonusEventId_customerId_key" ON "RaffleBonusEventUsage"("bonusEventId", "customerId");

-- MysteryBoxStreak: One streak record per customer
CREATE UNIQUE INDEX "MysteryBoxStreak_customerId_key" ON "MysteryBoxStreak"("customerId");

-- ============================================
-- INDEXES
-- ============================================

-- RaffleStreak indexes
CREATE INDEX "RaffleStreak_shop_customerId_idx" ON "RaffleStreak"("shop", "customerId");
CREATE INDEX "RaffleStreak_shop_currentStreak_idx" ON "RaffleStreak"("shop", "currentStreak");
CREATE INDEX "RaffleStreak_lastEntryDate_idx" ON "RaffleStreak"("lastEntryDate");

-- RaffleInstantWin indexes
CREATE INDEX "RaffleInstantWin_raffleId_isActive_idx" ON "RaffleInstantWin"("raffleId", "isActive");
CREATE INDEX "RaffleInstantWin_shop_idx" ON "RaffleInstantWin"("shop");

-- RaffleInstantWinLog indexes
CREATE INDEX "RaffleInstantWinLog_instantWinId_idx" ON "RaffleInstantWinLog"("instantWinId");
CREATE INDEX "RaffleInstantWinLog_customerId_idx" ON "RaffleInstantWinLog"("customerId");
CREATE INDEX "RaffleInstantWinLog_raffleEntryId_idx" ON "RaffleInstantWinLog"("raffleEntryId");
CREATE INDEX "RaffleInstantWinLog_shop_createdAt_idx" ON "RaffleInstantWinLog"("shop", "createdAt");

-- RaffleActivity indexes
CREATE INDEX "RaffleActivity_raffleId_createdAt_idx" ON "RaffleActivity"("raffleId", "createdAt");
CREATE INDEX "RaffleActivity_shop_createdAt_idx" ON "RaffleActivity"("shop", "createdAt");
CREATE INDEX "RaffleActivity_activityType_idx" ON "RaffleActivity"("activityType");

-- RaffleBonusEvent indexes
CREATE INDEX "RaffleBonusEvent_shop_isActive_idx" ON "RaffleBonusEvent"("shop", "isActive");
CREATE INDEX "RaffleBonusEvent_startsAt_endsAt_idx" ON "RaffleBonusEvent"("startsAt", "endsAt");
CREATE INDEX "RaffleBonusEvent_raffleId_idx" ON "RaffleBonusEvent"("raffleId");

-- RaffleBonusEventUsage indexes
CREATE INDEX "RaffleBonusEventUsage_customerId_idx" ON "RaffleBonusEventUsage"("customerId");

-- RaffleLuckyNumber indexes
CREATE INDEX "RaffleLuckyNumber_raffleId_idx" ON "RaffleLuckyNumber"("raffleId");
CREATE INDEX "RaffleLuckyNumber_customerId_idx" ON "RaffleLuckyNumber"("customerId");
CREATE INDEX "RaffleLuckyNumber_shop_createdAt_idx" ON "RaffleLuckyNumber"("shop", "createdAt");

-- MysteryBoxStreak indexes
CREATE INDEX "MysteryBoxStreak_shop_customerId_idx" ON "MysteryBoxStreak"("shop", "customerId");

-- MysteryBoxActivity indexes
CREATE INDEX "MysteryBoxActivity_boxId_createdAt_idx" ON "MysteryBoxActivity"("boxId", "createdAt");
CREATE INDEX "MysteryBoxActivity_shop_createdAt_idx" ON "MysteryBoxActivity"("shop", "createdAt");

-- MysteryBoxBonusEvent indexes
CREATE INDEX "MysteryBoxBonusEvent_shop_isActive_idx" ON "MysteryBoxBonusEvent"("shop", "isActive");
CREATE INDEX "MysteryBoxBonusEvent_shop_startsAt_endsAt_idx" ON "MysteryBoxBonusEvent"("shop", "startsAt", "endsAt");

-- MysteryBoxBonusEventUsage indexes
CREATE INDEX "MysteryBoxBonusEventUsage_eventId_customerId_idx" ON "MysteryBoxBonusEventUsage"("eventId", "customerId");
CREATE INDEX "MysteryBoxBonusEventUsage_shop_customerId_idx" ON "MysteryBoxBonusEventUsage"("shop", "customerId");

-- ============================================
-- FOREIGN KEYS
-- ============================================

-- RaffleStreak
ALTER TABLE "RaffleStreak" ADD CONSTRAINT "RaffleStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RaffleInstantWin
ALTER TABLE "RaffleInstantWin" ADD CONSTRAINT "RaffleInstantWin_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RaffleInstantWinLog
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_instantWinId_fkey" FOREIGN KEY ("instantWinId") REFERENCES "RaffleInstantWin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleInstantWinLog" ADD CONSTRAINT "RaffleInstantWinLog_raffleEntryId_fkey" FOREIGN KEY ("raffleEntryId") REFERENCES "RaffleEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RaffleActivity
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleActivity" ADD CONSTRAINT "RaffleActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RaffleBonusEvent
ALTER TABLE "RaffleBonusEvent" ADD CONSTRAINT "RaffleBonusEvent_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RaffleBonusEventUsage
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_bonusEventId_fkey" FOREIGN KEY ("bonusEventId") REFERENCES "RaffleBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleBonusEventUsage" ADD CONSTRAINT "RaffleBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RaffleLuckyNumber
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_raffleId_fkey" FOREIGN KEY ("raffleId") REFERENCES "Raffle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RaffleLuckyNumber" ADD CONSTRAINT "RaffleLuckyNumber_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MysteryBoxStreak
ALTER TABLE "MysteryBoxStreak" ADD CONSTRAINT "MysteryBoxStreak_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MysteryBoxActivity
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxActivity" ADD CONSTRAINT "MysteryBoxActivity_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- MysteryBoxBonusEvent
ALTER TABLE "MysteryBoxBonusEvent" ADD CONSTRAINT "MysteryBoxBonusEvent_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "MysteryBox"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MysteryBoxBonusEventUsage
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "MysteryBoxBonusEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MysteryBoxBonusEventUsage" ADD CONSTRAINT "MysteryBoxBonusEventUsage_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
