-- Migration: VAT-inclusive pricing
-- Rename *_ex_vat columns to simpler names (prices now include VAT)
-- Then multiply existing card prices by 1.20 so they're correct before next scraper run

ALTER TABLE cards RENAME COLUMN price_ex_vat TO price;
ALTER TABLE orders RENAME COLUMN total_ex_vat TO total;
ALTER TABLE order_items RENAME COLUMN unit_price_ex_vat TO unit_price;
ALTER TABLE cart_items RENAME COLUMN price_ex_vat TO price;
ALTER TABLE price_archive RENAME COLUMN price_ex_vat TO price;

-- Update existing card prices to include VAT (20%)
UPDATE cards SET price = ROUND(price * 1.20, 2) WHERE price IS NOT NULL AND price > 0;
