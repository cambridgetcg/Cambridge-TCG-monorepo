-- CreateIndex
-- Optimize store credit transaction history queries by adding composite index
-- Covers WHERE (customerId, shop) ORDER BY createdAt DESC pattern
CREATE INDEX "StoreCreditLedger_customerId_shop_createdAt_idx" ON "StoreCreditLedger"("customerId", "shop", "createdAt" DESC);
