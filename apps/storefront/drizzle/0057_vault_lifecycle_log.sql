-- Generalise the fulfilment audit table into a full vault-item lifecycle
-- log. The table was created in 0056 to log fulfilment transitions; this
-- migration extends it to record every status change vault items undergo
-- (sold_back, expired, gifted, etc) so support has a complete provenance
-- trail and not just the redemption portion.
--
-- We keep the original table name (vault_fulfilment_log) to avoid breaking
-- the existing fulfilment-undo path, but broaden semantics + add a
-- prior_status column so reviewers can see "X went from reserved to
-- sold_back" without having to reconstruct it from timestamps.

BEGIN;

ALTER TABLE vault_fulfilment_log
  ADD COLUMN IF NOT EXISTS prior_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS metadata     JSONB;

-- The action column is VARCHAR(20) with no CHECK constraint already, so
-- the new action values (sold_back, expired, gifted, traded, refunded,
-- compensation_failed, etc) need no schema change beyond this.

-- Backfill prior_status for existing 'fulfilled' rows: items that got
-- here came from 'reserved'. Conservative — only stamps when null.
UPDATE vault_fulfilment_log
   SET prior_status = 'reserved'
 WHERE prior_status IS NULL AND action = 'fulfilled';

CREATE INDEX IF NOT EXISTS idx_vault_log_action_time
  ON vault_fulfilment_log(action, created_at DESC);

COMMIT;
