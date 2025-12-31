-- Add Shopify timestamp columns to Customer table
-- These track when the customer was created/updated in Shopify (not in our DB)

ALTER TABLE "Customer" ADD COLUMN "shopifyCreatedAt" TIMESTAMP(3);
ALTER TABLE "Customer" ADD COLUMN "shopifyUpdatedAt" TIMESTAMP(3);
