-- CreateTable
CREATE TABLE "public"."BillingPlan" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentPeriodStart" TIMESTAMP(3) NOT NULL,
    "currentPeriodEnd" TIMESTAMP(3) NOT NULL,
    "ordersUsed" INTEGER NOT NULL DEFAULT 0,
    "ordersLimit" INTEGER NOT NULL,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "overageRate" DECIMAL(10,2),
    "shopifyChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UsageRecord" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "orderNumber" TEXT,
    "orderAmount" DECIMAL(10,2),
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billingPlanId" TEXT NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillingPlan_shop_key" ON "public"."BillingPlan"("shop");

-- CreateIndex
CREATE INDEX "BillingPlan_shop_idx" ON "public"."BillingPlan"("shop");

-- CreateIndex
CREATE INDEX "BillingPlan_status_idx" ON "public"."BillingPlan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_orderId_key" ON "public"."UsageRecord"("orderId");

-- CreateIndex
CREATE INDEX "UsageRecord_shop_processedAt_idx" ON "public"."UsageRecord"("shop", "processedAt" DESC);

-- CreateIndex
CREATE INDEX "UsageRecord_billingPlanId_idx" ON "public"."UsageRecord"("billingPlanId");

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_shop_orderId_key" ON "public"."UsageRecord"("shop", "orderId");

-- AddForeignKey
ALTER TABLE "public"."UsageRecord" ADD CONSTRAINT "UsageRecord_billingPlanId_fkey" FOREIGN KEY ("billingPlanId") REFERENCES "public"."BillingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
