-- Per-client order numbering
ALTER TABLE clients ADD COLUMN order_prefix text;
ALTER TABLE clients ADD COLUMN order_sequence integer NOT NULL DEFAULT 0;

ALTER TABLE orders ADD COLUMN client_order_number text;
