-- CreateEnum
CREATE TYPE "public"."LedgerEntryType" AS ENUM ('CASHBACK_EARNED', 'ORDER_PAYMENT', 'REFUND_CREDIT', 'MANUAL_ADJUSTMENT', 'SHOPIFY_SYNC');

-- CreateTable
CREATE TABLE "public"."Customer" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyCustomerId" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "storeCredit" DECIMAL(10,2) NOT NULL DEFAULT 0,
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

-- AddForeignKey
ALTER TABLE "public"."StoreCreditLedger" ADD CONSTRAINT "StoreCreditLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
