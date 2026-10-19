-- Marketing email needs the shopper's consent. Customers default to not
-- consenting, and every existing row is reset: consent is re-read from
-- Shopify's email marketing consent (SUBSCRIBED only) on the next customer
-- sync or customers/update webhook. The table is empty at the Supabase
-- cut-over; this keeps any copy of earlier data correct too.

-- AlterTable
ALTER TABLE "Customer" ALTER COLUMN "acceptsMarketing" SET DEFAULT false;

-- Reset consent that was assumed, not given
UPDATE "Customer" SET "acceptsMarketing" = false, "marketingConsentUpdatedAt" = NULL WHERE "acceptsMarketing" = true;
