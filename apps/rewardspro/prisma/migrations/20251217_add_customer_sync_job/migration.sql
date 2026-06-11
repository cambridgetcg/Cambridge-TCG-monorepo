-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CustomerSyncJob" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCustomers" INTEGER,
    "processedCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "lastCursor" TEXT,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "lastError" TEXT,
    "errorDetails" JSONB,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "triggeredBy" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerSyncJob_shop_status_idx" ON "CustomerSyncJob"("shop", "status");

-- CreateIndex
CREATE INDEX "CustomerSyncJob_shop_createdAt_idx" ON "CustomerSyncJob"("shop", "createdAt" DESC);
