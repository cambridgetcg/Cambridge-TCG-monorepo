-- CreateEnum
CREATE TYPE "MysteryBoxStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'ACTIVE', 'CLOSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MysteryBoxRarity" AS ENUM ('COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "MysteryBoxRewardType" AS ENUM ('POINTS', 'DISCOUNT', 'STORE_CREDIT', 'PRODUCT', 'CUSTOM', 'NOTHING');

-- CreateEnum
CREATE TYPE "MysteryBoxDeliveryStatus" AS ENUM ('PENDING', 'PROCESSING', 'DELIVERED', 'FAILED', 'CLAIMED');

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
