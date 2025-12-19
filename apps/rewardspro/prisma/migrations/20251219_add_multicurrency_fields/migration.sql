-- Add multi-currency tracking fields to Order table
-- These fields track the customer's currency when different from shop currency

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "presentmentCurrency" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "presentmentTotal" DECIMAL(10, 2);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(10, 6);
