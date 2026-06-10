-- CreateEnum
CREATE TYPE "public"."Currency" AS ENUM ('USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY', 'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB', 'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR');

-- CreateEnum
CREATE TYPE "public"."CurrencyDisplayType" AS ENUM ('SYMBOL', 'CODE');

-- CreateEnum
CREATE TYPE "public"."EvaluationPeriod" AS ENUM ('ANNUAL', 'LIFETIME');

-- CreateEnum
CREATE TYPE "public"."LedgerEntryType" AS ENUM ('CASHBACK_EARNED', 'ORDER_PAYMENT', 'REFUND_CREDIT', 'MANUAL_ADJUSTMENT', 'SHOPIFY_SYNC');

-- CreateEnum
CREATE TYPE "public"."TierChangeType" AS ENUM ('INITIAL_ASSIGNMENT', 'UPGRADE', 'DOWNGRADE');

-- CreateEnum
CREATE TYPE "public"."TierTriggerType" AS ENUM ('ACCOUNT_CREATED', 'PERIODIC_REVIEW', 'SPENDING_MILESTONE', 'MANUAL_ADMIN');

-- CreateTable
CREATE TABLE "public"."Session" (
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

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ShopSettings" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "storeName" TEXT NOT NULL,
    "storeUrl" TEXT NOT NULL,
    "storeCurrency" "public"."Currency" NOT NULL DEFAULT 'USD',
    "currencyDisplayType" "public"."CurrencyDisplayType" NOT NULL DEFAULT 'SYMBOL',
    "timezone" TEXT NOT NULL DEFAULT 'America/New_York',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Tier" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minSpend" INTEGER NOT NULL,
    "cashbackPercent" INTEGER NOT NULL,
    "evaluationPeriod" "public"."EvaluationPeriod" NOT NULL DEFAULT 'ANNUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "storeCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currentTierId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoreCreditLedger" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "balance" DECIMAL(10,2) NOT NULL,
    "type" "public"."LedgerEntryType" NOT NULL,
    "shopifyOrderId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoreCreditLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TierChangeLog" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "fromTierId" TEXT,
    "fromTierName" TEXT,
    "toTierId" TEXT,
    "toTierName" TEXT,
    "changeType" "public"."TierChangeType" NOT NULL,
    "triggerType" "public"."TierTriggerType" NOT NULL,
    "totalSpending" DECIMAL(10,2),
    "periodSpending" DECIMAL(10,2),
    "orderId" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedBy" TEXT,

    CONSTRAINT "TierChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Session_shop_idx" ON "public"."Session"("shop");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSettings_shop_key" ON "public"."ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "ShopSettings_shop_idx" ON "public"."ShopSettings"("shop");

-- CreateIndex
CREATE INDEX "Tier_shop_idx" ON "public"."Tier"("shop");

-- CreateIndex
CREATE INDEX "Tier_cashbackPercent_idx" ON "public"."Tier"("cashbackPercent");

-- CreateIndex
CREATE UNIQUE INDEX "Tier_shop_name_key" ON "public"."Tier"("shop", "name");

-- CreateIndex
CREATE INDEX "Customer_shop_idx" ON "public"."Customer"("shop");

-- CreateIndex
CREATE INDEX "Customer_email_idx" ON "public"."Customer"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shop_shopifyCustomerId_key" ON "public"."Customer"("shop", "shopifyCustomerId");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_customerId_idx" ON "public"."StoreCreditLedger"("customerId");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_type_idx" ON "public"."StoreCreditLedger"("type");

-- CreateIndex
CREATE INDEX "StoreCreditLedger_createdAt_idx" ON "public"."StoreCreditLedger"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "StoreCreditLedger_shop_shopifyOrderId_type_key" ON "public"."StoreCreditLedger"("shop", "shopifyOrderId", "type");

-- CreateIndex
CREATE INDEX "TierChangeLog_customerId_createdAt_idx" ON "public"."TierChangeLog"("customerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_shop_createdAt_idx" ON "public"."TierChangeLog"("shop", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TierChangeLog_changeType_idx" ON "public"."TierChangeLog"("changeType");

-- CreateIndex
CREATE INDEX "TierChangeLog_triggerType_idx" ON "public"."TierChangeLog"("triggerType");

-- AddForeignKey
ALTER TABLE "public"."Customer" ADD CONSTRAINT "Customer_currentTierId_fkey" FOREIGN KEY ("currentTierId") REFERENCES "public"."Tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoreCreditLedger" ADD CONSTRAINT "StoreCreditLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TierChangeLog" ADD CONSTRAINT "TierChangeLog_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
