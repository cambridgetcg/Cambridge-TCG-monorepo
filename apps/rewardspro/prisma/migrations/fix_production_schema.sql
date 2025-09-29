-- Migration to fix production schema mismatches
-- Run this on production database to add missing enum types and columns

-- ============================================================================
-- 1. CREATE MISSING ENUM TYPES
-- ============================================================================

-- Create OrderFinancialStatus enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "OrderFinancialStatus" AS ENUM (
        'PENDING',
        'AUTHORIZED',
        'PARTIALLY_PAID',
        'PAID',
        'PARTIALLY_REFUNDED',
        'REFUNDED',
        'VOIDED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create TierTriggerType enum if it doesn't exist
DO $$ BEGIN
    CREATE TYPE "TierTriggerType" AS ENUM (
        'MANUAL',
        'ORDER',
        'REFUND',
        'SCHEDULED',
        'ANNUAL_REVIEW',
        'ADMIN_ACTION',
        'SUBSCRIPTION',
        'SYSTEM'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 2. ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Add isActive column to TierProduct table if it doesn't exist
DO $$ BEGIN
    ALTER TABLE "TierProduct"
    ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN DEFAULT true;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- 3. FIX COLUMN TYPES IF NEEDED
-- ============================================================================

-- If financialStatus exists as text, convert it to enum
-- First check if the column exists and what type it is
DO $$
DECLARE
    col_type text;
BEGIN
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'Order'
    AND column_name = 'financialStatus';

    IF col_type = 'text' OR col_type = 'character varying' THEN
        -- Convert the column to use the enum type
        ALTER TABLE "Order"
        ALTER COLUMN "financialStatus"
        TYPE "OrderFinancialStatus"
        USING "financialStatus"::"OrderFinancialStatus";
    END IF;
END $$;

-- ============================================================================
-- 4. ADD INDEXES FOR PERFORMANCE
-- ============================================================================

-- Add index on Order.shop if it doesn't exist
CREATE INDEX IF NOT EXISTS "Order_shop_idx" ON "Order"("shop");

-- Add index on Order.customerId if it doesn't exist
CREATE INDEX IF NOT EXISTS "Order_customerId_idx" ON "Order"("customerId");

-- Add index on TierChangeLog.customerId if it doesn't exist
CREATE INDEX IF NOT EXISTS "TierChangeLog_customerId_idx" ON "TierChangeLog"("customerId");

-- Add index on TierChangeLog.shop if it doesn't exist
CREATE INDEX IF NOT EXISTS "TierChangeLog_shop_idx" ON "TierChangeLog"("shop");

-- ============================================================================
-- 5. VERIFY SCHEMA
-- ============================================================================

-- List all enum types
SELECT typname FROM pg_type WHERE typtype = 'e' ORDER BY typname;

-- Check Order table structure
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'Order'
ORDER BY ordinal_position;

-- Check TierChangeLog table structure
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_name = 'TierChangeLog'
ORDER BY ordinal_position;

-- Check TierProduct table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'TierProduct'
ORDER BY ordinal_position;