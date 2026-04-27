-- Add checked_quantity column for partial stock availability
-- stock_status is a text column, so no enum alteration needed for "partial"
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS checked_quantity integer;
