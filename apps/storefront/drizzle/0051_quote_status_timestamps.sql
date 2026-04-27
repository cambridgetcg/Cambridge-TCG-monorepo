-- Per-status timestamp columns on quote_requests so admin can render a
-- real fulfilment timeline. Mirrors migration 0047 for tradein_submissions.
-- Stamped by updateQuoteStatus on each transition via COALESCE, so the
-- original time sticks even if admin flips the status back and forth.

BEGIN;

ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS received_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at      TIMESTAMPTZ;

-- Backfill where the current status indicates the step has been reached.
-- updated_at is the best available approximation for historical rows.
UPDATE quote_requests SET received_at = updated_at
  WHERE received_at IS NULL AND status IN ('received','paid');
UPDATE quote_requests SET paid_at = updated_at
  WHERE paid_at IS NULL AND status = 'paid';

COMMIT;
