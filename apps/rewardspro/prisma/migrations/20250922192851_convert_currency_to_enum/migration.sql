-- Phase 2: Convert currency columns from String to Currency enum
-- This should be run AFTER Phase 1 constraints are validated
-- Made conditional to handle fresh databases where Order table may not exist yet

-- Create the Currency enum if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Currency') THEN
    CREATE TYPE "Currency" AS ENUM (
      'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
      'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
      'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
      'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
    );
  END IF;
END$$;

-- Convert Order.currency column to enum if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order' AND table_schema = 'public') THEN
    -- Check if column is not already an enum type
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'Order' AND column_name = 'currency'
               AND data_type = 'character varying') THEN
      ALTER TABLE "Order"
      ALTER COLUMN currency TYPE "Currency"
      USING currency::"Currency";
    END IF;
    -- Drop the temporary CHECK constraint if it exists
    ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS currency_check;
  ELSE
    RAISE NOTICE 'Order table does not exist, skipping currency enum conversion';
  END IF;
END $$;

-- Convert OrderRefund.currency column to enum if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OrderRefund' AND table_schema = 'public') THEN
    -- Check if column exists and is not already an enum type
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_name = 'OrderRefund' AND column_name = 'currency'
               AND data_type = 'character varying') THEN
      ALTER TABLE "OrderRefund"
      ALTER COLUMN currency TYPE "Currency"
      USING currency::"Currency";
    END IF;
    -- Drop the temporary CHECK constraint if it exists
    ALTER TABLE "OrderRefund" DROP CONSTRAINT IF EXISTS currency_check;
  ELSE
    RAISE NOTICE 'OrderRefund table does not exist, skipping currency enum conversion';
  END IF;
END $$;

-- Note: The enum type provides automatic validation
-- Any attempt to insert invalid values will now fail at the database level