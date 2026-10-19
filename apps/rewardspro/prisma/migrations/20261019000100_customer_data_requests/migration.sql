-- customers/data_request reports, kept encrypted for the merchant to
-- download (services/customer-data-request.server.ts).
--
-- Generated with prisma migrate diff from the baseline to
-- prisma/schema.prisma.

-- CreateTable
CREATE TABLE "CustomerDataRequest" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "shopifyRequestId" TEXT NOT NULL,
    "shopifyCustomerId" TEXT NOT NULL,
    "report" TEXT NOT NULL,
    "recordCount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "downloadedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDataRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CustomerDataRequest_shop_createdAt_idx" ON "CustomerDataRequest"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerDataRequest_expiresAt_idx" ON "CustomerDataRequest"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDataRequest_shop_shopifyRequestId_key" ON "CustomerDataRequest"("shop", "shopifyRequestId");

