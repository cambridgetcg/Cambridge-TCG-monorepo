-- Phase 2: Convert currency columns from String to Currency enum
-- This should be run AFTER Phase 1 constraints are validated

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

-- Convert Order.currency column to enum
-- This requires a brief lock but is fast with the CHECK constraint in place
ALTER TABLE "Order"
ALTER COLUMN currency TYPE "Currency"
USING currency::"Currency";

-- Convert OrderRefund.currency column to enum
ALTER TABLE "OrderRefund"
ALTER COLUMN currency TYPE "Currency"
USING currency::"Currency";

-- Drop the temporary CHECK constraints since the enum enforces the values
ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS currency_check;
ALTER TABLE "OrderRefund" DROP CONSTRAINT IF EXISTS currency_check;

-- Note: The enum type provides automatic validation
-- Any attempt to insert invalid values will now fail at the database level