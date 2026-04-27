-- Track cash-side payout when admin pays a trade-in via Stripe Connect.
-- Separate from credit_issued_at because a mixed payout has both legs and
-- they fire independently.

BEGIN;

ALTER TABLE tradein_submissions
  ADD COLUMN IF NOT EXISTS cash_paid_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stripe_transfer_id  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tradein_stripe_transfer
  ON tradein_submissions(stripe_transfer_id)
  WHERE stripe_transfer_id IS NOT NULL;

COMMIT;
