-- Add order status history audit table
CREATE TABLE IF NOT EXISTS "order_status_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "order_id" integer NOT NULL REFERENCES "orders"("id"),
  "from_status" text NOT NULL,
  "to_status" text NOT NULL,
  "changed_by" integer REFERENCES "clients"("id"),
  "changed_at" timestamp DEFAULT now(),
  "note" text
);

CREATE INDEX IF NOT EXISTS "order_status_history_order_idx"
  ON "order_status_history" USING btree ("order_id");

-- Update orders default status from 'draft' to 'submitted'
ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'submitted';

-- Clean up any existing 'draft' rows (should be none)
UPDATE "orders" SET "status" = 'submitted' WHERE "status" = 'draft';
