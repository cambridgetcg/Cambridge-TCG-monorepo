-- Per-status timestamp columns so the customer-facing stepper renders a
-- real timeline rather than a single "last updated" hint. Stamped by
-- updateSubmissionStatus on each transition.

BEGIN;

ALTER TABLE tradein_submissions
  ADD COLUMN IF NOT EXISTS received_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS grading_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS paid_at      TIMESTAMPTZ;

-- Backfill: where current status indicates a step has been reached, fall
-- back to updated_at as the best available timestamp.
UPDATE tradein_submissions SET received_at  = updated_at WHERE received_at IS NULL AND status IN ('received','grading','approved','paid');
UPDATE tradein_submissions SET grading_at   = updated_at WHERE grading_at  IS NULL AND status IN ('grading','approved','paid');
UPDATE tradein_submissions SET approved_at  = updated_at WHERE approved_at IS NULL AND status IN ('approved','paid');
UPDATE tradein_submissions SET paid_at      = updated_at WHERE paid_at     IS NULL AND status = 'paid';

COMMIT;
