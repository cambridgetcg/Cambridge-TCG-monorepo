CREATE TABLE stock_targets (
  id SERIAL PRIMARY KEY,
  price_min NUMERIC(10, 2) NOT NULL,
  price_max NUMERIC(10, 2) NOT NULL,
  target_qty INTEGER NOT NULL
);

-- Default tiers
INSERT INTO stock_targets (price_min, price_max, target_qty) VALUES
  (0, 5, 8),
  (5, 15, 4),
  (15, 50, 2),
  (50, 9999, 1);
