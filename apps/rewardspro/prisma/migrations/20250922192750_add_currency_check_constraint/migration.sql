-- Add CHECK constraint to validate currency values (non-blocking)
-- This is Phase 1 of the safe migration to Currency enum

-- Add the constraint WITHOUT validation first (no table lock)
ALTER TABLE "Order"
ADD CONSTRAINT currency_check CHECK (
  currency IS NULL OR currency IN (
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
    'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
    'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
    'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
  )
) NOT VALID;

-- Validate the constraint in the background (non-blocking)
-- This can be run separately to avoid locking the table
-- ALTER TABLE "Order" VALIDATE CONSTRAINT currency_check;

-- Add index to improve validation performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_currency ON "Order"(currency);

-- Add similar constraint to OrderRefund table if it has currency
ALTER TABLE "OrderRefund"
ADD CONSTRAINT currency_check CHECK (
  currency IS NULL OR currency IN (
    'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY',
    'SEK', 'NZD', 'NOK', 'MXN', 'SGD', 'HKD', 'KRW', 'TRY',
    'INR', 'RUB', 'BRL', 'ZAR', 'AED', 'PLN', 'DKK', 'THB',
    'IDR', 'HUF', 'CZK', 'ILS', 'CLP', 'PHP', 'RON', 'MYR'
  )
) NOT VALID;

-- Note: After this migration runs successfully:
-- 1. Monitor for any constraint violations in logs
-- 2. Fix any invalid currency values found
-- 3. Run the validation step: ALTER TABLE "Order" VALIDATE CONSTRAINT currency_check;
-- 4. Then proceed with Phase 2: Convert to enum type