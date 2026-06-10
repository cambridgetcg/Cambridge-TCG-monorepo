-- CreateEnum
CREATE TYPE "GiftCardStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DEACTIVATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "GiftCardBundleType" AS ENUM ('VALUE_ONLY', 'MEMBERSHIP_ONLY', 'VALUE_PLUS_MEMBERSHIP');

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

-- AddForeignKey
ALTER TABLE "TierGiftCardSettings" ADD CONSTRAINT "TierGiftCardSettings_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GiftCardBundle" ADD CONSTRAINT "GiftCardBundle_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
