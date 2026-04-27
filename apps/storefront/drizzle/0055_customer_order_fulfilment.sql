-- Customer order fulfilment visibility.
--
-- customer_orders currently has just a flat `status` column — customers
-- can see "completed" but not WHEN it shipped or WITH WHICH CARRIER.
-- Admin was squeezing tracking into vault_items.notes as a text prefix,
-- which meant the data existed but was invisible on /account/orders.
--
-- Add the fulfilment columns directly on the order. Status remains the
-- source of truth for the badge ('processing' / 'shipped' / 'completed');
-- the new columns power the customer-facing timeline + tracking link.
--
-- notes is intentionally separate from tracking_number so admins can
-- leave free-form context (e.g. "customer asked for signed-for") without
-- polluting the machine-parseable tracking.

BEGIN;

ALTER TABLE customer_orders
  ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100),
  ADD COLUMN IF NOT EXISTS carrier         VARCHAR(50),
  ADD COLUMN IF NOT EXISTS shipped_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivered_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes           TEXT;

-- Backfill: rows whose status already says shipped/completed should get
-- a shipped_at fallback from created_at so the UI timeline isn't blank.
-- Conservative — only stamps when the status implies the step is past.
UPDATE customer_orders SET shipped_at = created_at
  WHERE shipped_at IS NULL AND status IN ('shipped', 'completed');

CREATE INDEX IF NOT EXISTS idx_customer_orders_tracking
  ON customer_orders(tracking_number)
  WHERE tracking_number IS NOT NULL;

COMMIT;
