-- Fulfilment audit trail.
--
-- Every transition on a vault redemption (fulfilled, undone, errored)
-- writes a row here so support can answer "who shipped this and when"
-- and the admin queue can show a 30-minute undo affordance for misclick
-- recovery without leaving any state un-traceable.
--
-- A separate table (rather than columns on vault_items) keeps the
-- timeline append-only — undos add a new row instead of mutating the
-- prior one.

BEGIN;

CREATE TABLE IF NOT EXISTS vault_fulfilment_log (
  id              BIGSERIAL PRIMARY KEY,
  vault_item_id   UUID NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
  order_id        INT  REFERENCES customer_orders(id),
  action          VARCHAR(20) NOT NULL,  -- fulfilled | undone | errored
  actor_admin_id  UUID,                  -- admin who performed the action (when known)
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_fulfilment_log_item
  ON vault_fulfilment_log(vault_item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_vault_fulfilment_log_order
  ON vault_fulfilment_log(order_id, created_at DESC);

COMMIT;
