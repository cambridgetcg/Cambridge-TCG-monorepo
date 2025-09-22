-- Add missing fields to Customer table
ALTER TABLE "Customer"
ADD COLUMN IF NOT EXISTS "firstName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "lastName" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "tags" TEXT;

-- Add fields for historical tier tracking to Order table
ALTER TABLE "Order"
ADD COLUMN IF NOT EXISTS "cashbackPercentAtOrder" INTEGER;

-- Ensure we have the tierIdAtOrder and tierNameAtOrder fields (they should exist)
-- Just documenting here for clarity