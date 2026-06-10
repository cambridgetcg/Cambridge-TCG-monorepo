-- CreateTable for ExchangeRate
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "baseCurrency" "Currency" NOT NULL DEFAULT 'USD',
    "rates" JSONB NOT NULL,
    "provider" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable for SystemAlert
CREATE TABLE "SystemAlert" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex for ExchangeRate
CREATE INDEX "ExchangeRate_baseCurrency_fetchedAt_idx" ON "ExchangeRate"("baseCurrency", "fetchedAt" DESC);
CREATE INDEX "ExchangeRate_createdAt_idx" ON "ExchangeRate"("createdAt" DESC);

-- CreateIndex for SystemAlert
CREATE INDEX "SystemAlert_type_resolved_idx" ON "SystemAlert"("type", "resolved");
CREATE INDEX "SystemAlert_severity_createdAt_idx" ON "SystemAlert"("severity", "createdAt" DESC);