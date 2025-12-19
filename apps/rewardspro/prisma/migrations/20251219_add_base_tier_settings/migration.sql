-- Add base tier configuration fields to ShopSettings table

ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "autoAssignBaseTier" BOOLEAN DEFAULT true;
ALTER TABLE "ShopSettings" ADD COLUMN IF NOT EXISTS "defaultBaseTierId" TEXT;

-- Add foreign key constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'ShopSettings_defaultBaseTierId_fkey'
    AND table_name = 'ShopSettings'
  ) THEN
    ALTER TABLE "ShopSettings"
    ADD CONSTRAINT "ShopSettings_defaultBaseTierId_fkey"
    FOREIGN KEY ("defaultBaseTierId") REFERENCES "Tier"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
