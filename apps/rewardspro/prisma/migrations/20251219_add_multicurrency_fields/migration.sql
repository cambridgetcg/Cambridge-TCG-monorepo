-- Add multi-currency tracking fields to Order table
-- These fields track the customer's currency when different from shop currency
-- Made conditional to handle fresh databases where Order table may not exist yet

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'Order' AND table_schema = 'public') THEN
    -- Add columns only if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'presentmentCurrency') THEN
      ALTER TABLE "Order" ADD COLUMN "presentmentCurrency" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'presentmentTotal') THEN
      ALTER TABLE "Order" ADD COLUMN "presentmentTotal" DECIMAL(10, 2);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Order' AND column_name = 'exchangeRate') THEN
      ALTER TABLE "Order" ADD COLUMN "exchangeRate" DECIMAL(10, 6);
    END IF;
  ELSE
    RAISE NOTICE 'Order table does not exist, skipping multi-currency fields';
  END IF;
END $$;
