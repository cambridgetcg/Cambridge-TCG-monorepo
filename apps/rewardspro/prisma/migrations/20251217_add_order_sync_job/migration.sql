-- CreateTable
CREATE TABLE "OrderSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalOrders" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 50,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "lastError" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderSyncJob_shop_status_idx" ON "OrderSyncJob"("shop", "status");

-- CreateIndex
CREATE INDEX "OrderSyncJob_shop_createdAt_idx" ON "OrderSyncJob"("shop", "createdAt" DESC);
