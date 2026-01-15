-- Add CHECK constraint to validate currency values (non-blocking)
-- This is Phase 1 of the safe migration to Currency enum
-- Made conditional to handle fresh databases where Order table may not exist yet

-- Add the constraint to Order table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order' AND table_schema = 'public') THEN
    -- Check if constraint already exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'currency_check' AND table_name = 'Order') THEN
      ALTER TABLE "Order"
      ADD CONSTRAINT currency_check CHECK (
        currency IS NULL OR currency IN (
          'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
          'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
          'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
          'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
        )
      ) NOT VALID;
    END IF;
  ELSE
    RAISE NOTICE 'Order table does not exist, skipping currency_check constraint';
  END IF;
END $$;

-- Add index to Order table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order' AND table_schema = 'public') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_order_currency') THEN
      CREATE INDEX idx_order_currency ON "Order"(currency);
    END IF;
  END IF;
END $$;

-- Add similar constraint to OrderRefund table if it exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'OrderRefund' AND table_schema = 'public') THEN
    -- Check if constraint already exists
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                   WHERE constraint_name = 'currency_check' AND table_name = 'OrderRefund') THEN
      ALTER TABLE "OrderRefund"
      ADD CONSTRAINT currency_check CHECK (
        currency IS NULL OR currency IN (
          'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
          'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
          'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
          'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
        )
      ) NOT VALID;
    END IF;
  ELSE
    RAISE NOTICE 'OrderRefund table does not exist, skipping currency_check constraint';
  END IF;
END $$;

-- Note: After this migration runs successfully:
-- 1. Monitor for any constraint violations in logs
-- 2. Fix any invalid currency values found
-- 3. Run the validation step: ALTER TABLE "Order" VALIDATE CONSTRAINT currency_check;
-- 4. Then proceed with Phase 2: Convert to enum type